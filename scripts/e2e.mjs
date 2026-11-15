#!/usr/bin/env node
// End-to-end check of the juror path over HTTP, as a brand-new guest with a generated ID.
// Usage: node scripts/e2e.mjs [base-url]     (default http://localhost:3000)
// Each run writes 3 lessons, so against production it spends 3 lesson generations.
// It does not trigger the ID lookup rate limit (one unknown-ID lookup per run).

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
let failures = 0;

/** A browser stand-in: keeps the session cookie between calls. */
function jar() {
  let cookie = "";
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      redirect: "manual",
      headers: { "content-type": "application/json", "x-timezone": "UTC", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  };
}

function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  return ok;
}

const step = (title) => console.log(`\n${title}`);
const leaks = (questions) => questions.some((q) => "correct_index" in q || "explanation" in q || "source_quote" in q);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Answers every question of the open lesson through the check endpoint, then grades it. */
async function answerLesson(call, lesson, pick) {
  const feedback = {};
  for (const q of [...lesson.lesson.review_quiz, ...lesson.lesson.quiz]) {
    const c = await call("POST", "/api/answers/check", { lesson_key: lesson.lesson_key, question_id: q.question_id, choice: pick(q) });
    feedback[q.question_id] = c.data.feedback;
  }
  const graded = await call("POST", "/api/answers", { lesson_key: lesson.lesson_key });
  return { feedback, graded };
}

async function run() {
  console.log(`E2E against ${BASE}`);
  const call = jar();
  const known = new Map(); // prompt -> correct option text, learned from revealed answers

  step("1. ID entry: one tap to a new ID, no account");
  const enterPage = await call("GET", "/enter");
  check("/enter loads", enterPage.status === 200 && String(enterPage.data).includes("<html"), enterPage.status);
  check("signed-out API calls get 401", (await call("GET", "/api/me")).status === 401);
  const gen = await call("POST", "/api/identity/generate");
  check("Generate ID signs in", gen.status === 200 && /^[0-9a-z]{5}(-[0-9a-z]{5}){3}$/.test(gen.data.login_id ?? ""), gen.data);
  const loginId = gen.data.login_id;
  let me = await call("GET", "/api/me");
  check("stage is 'survey' with the sample course attached", me.data.stage === "survey" && me.data.course?.units?.length >= 6, me.data);
  check("the sidebar ID matches", me.data.login_id === loginId);
  const units = me.data.course.units;

  const other = jar();
  const typed = await other("POST", "/api/identity/enter", { login_id: ` ${loginId.toUpperCase()} ` });
  const meOther = await other("GET", "/api/me");
  check("the same ID typed in another window returns to the same learner", typed.status === 200 && meOther.data.client_key === me.data.client_key, meOther.data);
  const unknown = await jar()("POST", "/api/identity/enter", { login_id: "zzzzz-zzzzz-zzzzz-zzzzz" });
  check("an unknown ID gets a friendly message", unknown.status === 404 && /recognise/.test(unknown.data.error ?? ""), unknown);

  step("2. Survey");
  const today0 = me.data.today;
  const profile = {
    course_title: "PMP exam prep",
    goal: "Move into a project manager role",
    success: "Pass the PMP exam on the first attempt",
    focus: [units[1].title],
    skip: [],
    minutes_per_day: 15,
    study_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    deadline: addDays(today0, 14),
    prior_knowledge: "Leads projects, self-taught, no formal training",
    blocker: "time",
    blocker_note: "Evenings disappear",
  };
  check("invalid survey answers are rejected", (await call("POST", "/api/profile", { profile: { ...profile, blocker: "nope" } })).status === 400);
  check("survey saves", (await call("POST", "/api/profile", { profile })).status === 200);

  step("3. Short test");
  const pq = (await call("GET", "/api/placement")).data.questions ?? [];
  check("5 placement questions, no answers leaked", pq.length === 5 && !leaks(pq), pq[0]);
  const graded = await call("POST", "/api/placement", { answers: Object.fromEntries(pq.map((q, i) => [q.question_id, i === 0 ? -1 : 0])) });
  check("short test is graded", graded.status === 200, graded.data);
  const knownUnits = new Set(graded.data.results.filter((r) => r.correct).map((r) => r.unit_id));
  let list = (await call("GET", "/api/lessons")).data.items;
  check(
    "units match the answers: 'known' for correct, exactly one 'next', the rest 'locked'",
    list.every((i) => (knownUnits.has(i.unit_id) ? i.state === "known" : ["next", "locked"].includes(i.state))) &&
      list.filter((i) => i.state === "next").length === 1,
    list.map((i) => `${i.unit_id}:${i.state}`),
  );
  const firstOpen = list.find((i) => i.state === "next").unit_id;
  const aLocked = list.find((i) => i.state === "locked");
  if (aLocked) {
    const locked = await call("GET", `/api/lesson?unit=${aLocked.unit_id}`);
    check("a locked unit's lesson is refused (403 locked)", locked.status === 403 && locked.data.code === "locked", locked);
  }

  step("4. Session length, then the first lesson with one question wrong on purpose");
  const ses0 = (await call("GET", "/api/session")).data;
  check("the time chooser is due, with the profile's 15 minutes as the default", ses0.ask === true && ses0.default_minutes === 15 && ses0.options?.length === 5, ses0);
  const ses1 = (await call("POST", "/api/session", { minutes: 20 })).data;
  check("today's choice of 20 minutes is stored", ses1.chosen === 20 && ses1.ask === false && ses1.lesson_minutes === 20, ses1);
  check("a later choice on the same day does not replace it", (await call("POST", "/api/session", { minutes: 10 })).data.chosen === 20);
  const t0 = Date.now();
  const l1 = (await call("GET", "/api/lesson")).data;
  check(`lesson returned (${Date.now() - t0} ms)`, !!l1.lesson && l1.lesson.unit_id === firstOpen, l1);
  check("the lesson is sized to today's choice", l1.order?.minutes === 20, l1.order);
  check("mode 'new', why line, 3 to 5 quiz questions, a source quote per section", l1.order?.mode === "new" && l1.order.why && l1.lesson.quiz.length >= 3 && l1.lesson.quiz.length <= 5 && l1.lesson.sections.every((s) => s.source_quote), l1.order);
  check("no answers leak before checking", !leaks([...l1.lesson.quiz, ...l1.lesson.review_quiz]));
  check("refresh returns the same cached lesson", (await call("GET", "/api/lesson")).data.lesson_key === l1.lesson_key);
  const firstQ = l1.lesson.quiz[0];
  const r1 = await answerLesson(call, l1, (q) => (q.question_id === firstQ.question_id ? -1 : 0));
  for (const q of l1.lesson.quiz) known.set(q.prompt, q.options[r1.feedback[q.question_id].correct_index]);
  const relock = await call("POST", "/api/answers/check", { lesson_key: l1.lesson_key, question_id: firstQ.question_id, choice: 0 });
  check("an answer cannot be changed after it is checked", relock.data.feedback?.chosen === -1, relock.data);
  check("answers graded", r1.graded.status === 200 && r1.graded.data.result, r1.graded.data);
  const missed = r1.graded.data.result.quiz[0].concept;
  check(`missed concept "${missed}" is scheduled`, r1.graded.data.result.coming_back.some((c) => c.concept === missed));
  const reopened = await call("GET", `/api/lesson?key=${l1.lesson_key}`);
  check("the graded lesson reopens with its result (refresh keeps progress)", reopened.data.result?.score === r1.graded.data.result.score);
  list = (await call("GET", "/api/lessons")).data.items;
  const s1 = list.find((i) => i.unit_id === firstOpen);
  if (r1.graded.data.result.status === "needs_review") {
    check("failed: the same unit stays the open one, as a review", s1.state === "next" && s1.mode === "review", s1);
  } else {
    check("passed: the unit is done and the next one unlocked", s1.state === "done" && list.filter((i) => i.state === "next").length === 1, list);
  }

  step("5. Skip to tomorrow: the next lesson changes");
  check("demo_day_offset is 1", (await call("POST", "/api/demo/skip-day")).data.demo_day_offset === 1);
  const ses2 = (await call("GET", "/api/session")).data;
  check("the new day asks for the time again", ses2.ask === true && ses2.chosen === null, ses2);
  const ses3 = (await call("POST", "/api/session", { minutes: 30 })).data;
  check("30 minutes is two short lessons of 15", ses3.lessons_in_session === 2 && ses3.lesson_minutes === 15, ses3);
  const l2 = (await call("GET", "/api/lesson")).data;
  check("the lesson is one of the two 15-minute lessons", l2.order?.minutes === 15, l2.order);
  check(`why line names "${missed}"`, (l2.order?.why ?? "").includes(`“${missed}”`), l2.order?.why);
  check(
    "the missed concept is a review question",
    l2.order.review_concepts.some((c) => c.concept === missed) && l2.lesson.review_quiz.length === l2.order.review_concepts.length,
    l2.order.review_concepts,
  );
  console.log(`      why: ${l2.order.why}`);
  check("today's reminder is the planned-day email", (await call("GET", "/api/reminder-preview")).data.today_type === "planned_day");
  const openBefore = (await call("GET", "/api/lessons")).data.items.find((i) => i.state === "next").unit_id;
  const r2 = await answerLesson(call, l2, (q) => {
    const answer = known.get(q.prompt);
    return answer ? Math.max(0, q.options.indexOf(answer)) : 0;
  });
  check("one of today's two lessons is done", (await call("GET", "/api/session")).data.lessons_done_today === 1);
  list = (await call("GET", "/api/lessons")).data.items;
  const after = list.find((i) => i.unit_id === openBefore);
  if (r2.graded.data.result.status === "done") {
    const nextUnit = list.find((i) => i.state === "next");
    check(`passed: "${openBefore}" is done and "${nextUnit?.unit_id}" unlocked`, after.state === "done" && !!nextUnit && nextUnit.unit_id !== openBefore, list);
  } else {
    check(`failed: "${openBefore}" stays open as a review`, after.state === "next" && after.mode === "review", after);
  }

  step("6. Miss a study day: catch-up and missed-day email");
  await call("POST", "/api/demo/skip-day", { days: 2 });
  const l3 = (await call("GET", "/api/lesson")).data;
  check("mode is 'catch_up' at 10 minutes or less", l3.order?.mode === "catch_up" && l3.order.minutes <= 10, l3.order ?? l3);
  console.log(`      why: ${l3.order?.why}`);
  const mail = (await call("GET", "/api/reminder-preview")).data;
  check("today's reminder is the missed-day email", mail.today_type === "missed_day", mail.today_type);
  for (const type of ["planned_day", "missed_day"]) {
    const e = mail.emails?.[type];
    check(`${type} email renders with real values`, e && e.subject && e.body && !/\{\w+\}/.test(e.subject + e.body), e);
  }
  const cal = (await call("GET", "/api/calendar")).data;
  check("the calendar marks the missed day and today", cal.days?.some((d) => d.status === "missed") && cal.days.some((d) => d.is_today), cal.days?.filter((d) => d.status !== "rest"));

  step("7. Pace line flips after skipped days");
  let plan = (await call("GET", "/api/plan")).data;
  check("starts 'On track'", plan.pace.on_track, plan.pace);
  let skips = 0;
  while (plan.pace.on_track && skips < 40) {
    await call("POST", "/api/demo/skip-day");
    plan = (await call("GET", "/api/plan")).data;
    skips++;
  }
  check(`flips to "${plan.pace.line}" after ${skips} more skipped days`, /^Behind by \d+ lessons?$/.test(plan.pace.line), plan.pace);

  step("8. Health, guards, sign-out");
  const health = await call("GET", "/api/health");
  check(`health ok (ai: ${health.data.ai}, sample: ${health.data.sample})`, health.status === 200 && health.data.ok, health.data);
  check("unknown lesson key is a 404", (await call("GET", "/api/lesson?key=doesnotexist")).status === 404);
  await call("POST", "/api/identity/sign-out");
  check("signed out after sign-out", (await call("GET", "/api/me")).status === 401);
  check("the other window is still signed in", (await other("GET", "/api/me")).status === 200);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
