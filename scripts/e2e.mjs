#!/usr/bin/env node
// End-to-end check of the juror path over HTTP, as a brand-new guest.
// Usage: node scripts/e2e.mjs [base-url]     (default http://localhost:3000)
// Each run writes 3 lessons, so against production it spends 3 lesson generations.

const BASE = (process.argv[2] || process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const learnerId = crypto.randomUUID();
let failures = 0;

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", "x-learner-id": learnerId, "x-timezone": "UTC", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function check(name, ok, detail = "") {
  if (!ok) failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${!ok && detail ? `\n      ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 400)}` : ""}`);
  return ok;
}

function step(title) {
  console.log(`\n${title}`);
}

/** No answer key may reach the browser before submission. */
function leaks(questions) {
  return questions.some((q) => "correct_index" in q || "explanation" in q || "source_quote" in q);
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

async function run() {
  console.log(`E2E against ${BASE} as guest ${learnerId}`);

  step("1. Guest start, no account");
  const home = await call("GET", "/");
  check("landing page loads", home.status === 200 && String(home.data).includes("<html"), home.status);
  let me = await call("GET", "/api/me");
  check("new guest is at stage 'start'", me.data.stage === "start", me.data);
  const course = await call("POST", "/api/course", { source: "sample" });
  check("sample course loads", course.status === 200 && course.data.title, course.data);
  me = await call("GET", "/api/me");
  check("stage moves to 'survey'", me.data.stage === "survey", me.data);
  const units = me.data.course?.units ?? [];
  check("course plan has 6 to 10 units", units.length >= 6 && units.length <= 10, units.length);

  step("2. Survey");
  const today0 = me.data.today;
  const profile = {
    course_title: me.data.course.title,
    goal: "Move into a project manager role",
    success: "Pass the exam on the first attempt",
    focus: [units[1].title],
    skip: [],
    minutes_per_day: 15,
    study_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    deadline: addDays(today0, 14),
    prior_knowledge: "Some hands-on experience, no formal training",
    blocker: "time",
    blocker_note: "",
  };
  const bad = await call("POST", "/api/profile", { profile: { ...profile, blocker: "nope" } });
  check("invalid survey answers are rejected", bad.status === 400, bad);
  const saved = await call("POST", "/api/profile", { profile });
  check("survey saves", saved.status === 200, saved.data);

  step("3. Short test");
  const placement = await call("GET", "/api/placement");
  const pq = placement.data.questions ?? [];
  check("5 placement questions", pq.length === 5, pq.length);
  check("no answers leak before submission", !leaks(pq), pq[0]);
  const pAnswers = Object.fromEntries(pq.map((q, i) => [q.question_id, i === 0 ? -1 : 0]));
  const graded = await call("POST", "/api/placement", { answers: pAnswers });
  check("short test is graded", graded.status === 200, graded.data);
  const plan1 = await call("GET", "/api/plan");
  const statusOf = Object.fromEntries(plan1.data.units.map((u) => [u.unit_id, u.status]));
  const expectKnown = new Set(graded.data.results.filter((r) => r.correct).map((r) => r.unit_id));
  check(
    "record has 'known' exactly for correct answers, 'todo' elsewhere",
    plan1.data.units.every((u) => (expectKnown.has(u.unit_id) ? u.status === "known" : u.status === "todo")),
    statusOf,
  );

  step("4. First lesson");
  const t0 = Date.now();
  const l1 = await call("GET", "/api/lesson");
  check(`lesson returned (${Date.now() - t0} ms)`, l1.status === 200 && l1.data.lesson, l1.data);
  const lesson1 = l1.data.lesson;
  check("mode is 'new' with a why line", l1.data.order.mode === "new" && l1.data.order.why.length > 0, l1.data.order);
  check("3 quiz questions", lesson1.quiz.length === 3, lesson1.quiz.length);
  check("every section has a source quote", lesson1.sections.every((s) => s.source_quote), lesson1.sections);
  check("no answers leak before submission", !leaks([...lesson1.quiz, ...lesson1.review_quiz]), lesson1.quiz[0]);
  const again = await call("GET", "/api/lesson");
  check("refresh returns the same cached lesson", again.data.lesson_key === l1.data.lesson_key);

  step("5. One wrong answer");
  const answers1 = Object.fromEntries(lesson1.quiz.map((q, i) => [q.question_id, i === 0 ? -1 : 0]));
  const r1 = await call("POST", "/api/answers", { lesson_key: l1.data.lesson_key, answers: answers1 });
  check("answers graded", r1.status === 200 && r1.data.result, r1.data);
  const missed = r1.data.result.quiz[0].concept;
  check(`missed concept "${missed}" is scheduled`, r1.data.result.coming_back.some((c) => c.concept === missed), r1.data.result.coming_back);
  check("answers revealed after submission", Number.isInteger(r1.data.result.quiz[0].correct_index));
  const dup = await call("POST", "/api/answers", { lesson_key: l1.data.lesson_key, answers: answers1 });
  check("double submit is not graded twice", dup.data.already_graded === true, dup.data);
  const reopened = await call("GET", `/api/lesson?key=${l1.data.lesson_key}`);
  check("graded lesson reopens with its result (refresh keeps progress)", reopened.data.result?.score === r1.data.result.score);

  step("6. Skip to tomorrow: the next lesson changes");
  const skip1 = await call("POST", "/api/demo/skip-day");
  check("demo_day_offset is 1", skip1.data.demo_day_offset === 1, skip1.data);
  const l2 = await call("GET", "/api/lesson");
  check("next lesson returned", l2.status === 200 && l2.data.lesson, l2.data);
  check(`why line names "${missed}"`, l2.data.order.why.includes(`“${missed}”`), l2.data.order.why);
  check(
    "missed concept is in review_concepts and the lesson has one review question per concept",
    l2.data.order.review_concepts.some((c) => c.concept === missed) &&
      l2.data.lesson.review_quiz.length === l2.data.order.review_concepts.length,
    { review_concepts: l2.data.order.review_concepts, review_quiz: l2.data.lesson.review_quiz.length },
  );
  console.log(`      why: ${l2.data.order.why}`);
  const mail1 = await call("GET", "/api/reminder-preview");
  check("today's reminder is the planned-day email", mail1.data.today_type === "planned_day", mail1.data.today_type);

  step("7. Miss a study day: catch-up and missed-day email");
  const all2 = [...l2.data.lesson.quiz, ...l2.data.lesson.review_quiz];
  await call("POST", "/api/answers", { lesson_key: l2.data.lesson_key, answers: Object.fromEntries(all2.map((q) => [q.question_id, 0])) });
  await call("POST", "/api/demo/skip-day");
  await call("POST", "/api/demo/skip-day");
  const l3 = await call("GET", "/api/lesson");
  check("mode is 'catch_up' at 10 minutes or less", l3.data.order?.mode === "catch_up" && l3.data.order.minutes <= 10, l3.data.order ?? l3.data);
  console.log(`      why: ${l3.data.order?.why}`);
  const mail2 = await call("GET", "/api/reminder-preview");
  check("today's reminder is the missed-day email", mail2.data.today_type === "missed_day", mail2.data.today_type);
  for (const type of ["planned_day", "missed_day"]) {
    const e = mail2.data.emails?.[type];
    check(`${type} email renders with real values`, e && e.subject && e.body && !/\{\w+\}/.test(e.subject + e.body), e);
  }

  step("8. Pace line flips after skipped days");
  let plan = await call("GET", "/api/plan");
  const before = plan.data.pace;
  check("starts 'On track'", before.on_track && before.line === "On track", before);
  let skips = 0;
  while (plan.data.pace.on_track && skips < 40) {
    await call("POST", "/api/demo/skip-day");
    plan = await call("GET", "/api/plan");
    skips++;
  }
  check(`flips to "${plan.data.pace.line}" after ${skips} skipped days`, /^Behind by \d+ lessons?$/.test(plan.data.pace.line), plan.data.pace);

  step("9. Guards");
  const noId = await call("GET", "/api/me", undefined, { "x-learner-id": "not-a-uuid" });
  check("invalid learner id is rejected", noId.status === 400, noId);
  const missing = await call("GET", "/api/lesson?key=doesnotexist");
  check("unknown lesson key is a 404", missing.status === 404, missing);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
