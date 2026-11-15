// Session length over the API: the time chooser's data, the stored choice, and the lesson it sizes.
// Runs the real route handlers against an in-memory database.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { LessonsResponse, MeResponse, PlanResponse, PresentedLesson, SessionResponse } from "@/lib/api-types";
import { addDays } from "@/lib/dates";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  me: (await import("@/app/api/me/route")).GET,
  profile: (await import("@/app/api/profile/route")).POST,
  placement: await import("@/app/api/placement/route"),
  session: await import("@/app/api/session/route"),
  lesson: (await import("@/app/api/lesson/route")).GET,
  lessons: (await import("@/app/api/lessons/route")).GET,
  plan: (await import("@/app/api/plan/route")).GET,
  check: (await import("@/app/api/answers/check/route")).POST,
  answers: (await import("@/app/api/answers/route")).POST,
  skip: (await import("@/app/api/demo/skip-day/route")).POST,
  reset: (await import("@/app/api/demo/reset/route")).POST,
  db: await import("@/lib/db"),
});

let r: Awaited<ReturnType<typeof routes>>;
let ip = 20;

const profileOf = (today: string, minutes: number) => ({
  course_title: "PMP exam prep",
  goal: "Move into a project manager role",
  success: "Pass the PMP exam on the first attempt",
  focus: [],
  skip: [],
  minutes_per_day: minutes,
  study_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  deadline: addDays(today, 14),
  prior_knowledge: "Leads projects, self-taught, no formal training",
  blocker: "time",
  blocker_note: "Evenings disappear",
});

/** A new learner with the survey done (at `minutes` a day) and every short-test question answered wrong. */
async function learner(minutes = 15): Promise<Client> {
  const c = new Client(`10.0.1.${ip++}`);
  await c.call(r.generate, "/api/identity/generate", { method: "POST" });
  const me = await c.call<MeResponse>(r.me, "/api/me");
  const saved = await c.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.data.today, minutes) } });
  expect(saved.status).toBe(200);
  const q = await c.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
  await c.call(r.placement.POST, "/api/placement", { method: "POST", body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) } });
  return c;
}

const getSession = (c: Client) => c.call<SessionResponse>(r.session.GET, "/api/session");
const choose = (c: Client, minutes: unknown) => c.call<SessionResponse>(r.session.POST, "/api/session", { method: "POST", body: { minutes } });
const openLesson = (c: Client, query = "") => c.call<PresentedLesson>(r.lesson, `/api/lesson${query}`);

/** Answers every question of the open lesson correctly and grades it. */
async function pass(c: Client) {
  const open = await openLesson(c);
  const row = (await r.db.loadLesson(open.data.lesson_key))!;
  for (const q of [...row.lesson.quiz, ...row.lesson.review_quiz]) {
    await c.call(r.check, "/api/answers/check", { method: "POST", body: { lesson_key: row.lesson_key, question_id: q.question_id, choice: q.correct_index } });
  }
  const graded = await c.call(r.answers, "/api/answers", { method: "POST", body: { lesson_key: row.lesson_key } });
  expect(graded.status).toBe(200);
  return open.data;
}

beforeAll(async () => {
  r = await routes();
});

describe("session length over the API", () => {
  it("asks at the start of a day's session, with the profile's minutes as the default", async () => {
    const c = await learner(20);
    const s = await getSession(c);
    expect(s.status).toBe(200);
    expect(s.data).toMatchObject({ ask: true, chosen: null, default_minutes: 20, minutes: 20, lessons_in_session: 1, lesson_minutes: 20, lessons_done_today: 0 });
    expect(s.data.options.map((o) => o.minutes)).toEqual([10, 15, 20, 25, 30]);
    expect(s.data.options.filter((o) => o.lessons === 2).map((o) => [o.minutes, o.lesson_minutes])).toEqual([[25, 12], [30, 15]]);
    expect(typeof s.data.open_unit_id).toBe("string");
  });

  it("stores today's choice, and the lesson is written for it", async () => {
    const c = await learner(20);
    const chosen = await choose(c, 10);
    expect(chosen.status).toBe(200);
    expect(chosen.data).toMatchObject({ ask: false, chosen: 10, default_minutes: 20, minutes: 10, lesson_minutes: 10 });
    const lesson = await openLesson(c);
    expect(lesson.data.order.minutes).toBe(10);
    const list = await c.call<LessonsResponse>(r.lessons, "/api/lessons");
    expect(list.data.next?.minutes).toBe(10);
    const plan = await c.call<PlanResponse>(r.plan, "/api/plan");
    expect(plan.data.next?.minutes).toBe(10);
    expect(plan.data.session).toMatchObject({ chosen: 10, minutes: 10 });
    expect(plan.data.lesson_minutes).toBe(20); // the usual lesson length still follows the profile
  });

  it("a written lesson shows the time estimated from its own words and questions, on its page and in the lessons list", async () => {
    const c = await learner(10);
    await choose(c, 30); // two lessons of 15 minutes
    const studied = await pass(c);
    const stored = (await r.db.loadLesson(studied.lesson_key))!.lesson;
    const text = [stored.title, ...stored.sections.flatMap((s) => [s.heading, s.body_md, s.source_quote]), ...stored.key_points].join(" ");
    const expected = Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 180 + (stored.quiz.length + stored.review_quiz.length) * 0.75));
    expect(studied.estimate_minutes).toBe(expected);

    let list = await c.call<LessonsResponse>(r.lessons, "/api/lessons");
    expect(list.data.items.find((i) => i.unit_id === studied.order.unit.unit_id)).toMatchObject({ date_kind: "studied", minutes: expected });
    // Not written yet: the usual lesson length from the survey.
    expect(list.data.items.find((i) => i.state === "next")!.minutes).toBe(15);
    expect(list.data.items.filter((i) => i.state === "locked").every((i) => i.minutes === 10)).toBe(true);

    const open = await openLesson(c);
    list = await c.call<LessonsResponse>(r.lessons, "/api/lessons");
    expect(list.data.items.find((i) => i.state === "next")!.minutes).toBe(open.data.estimate_minutes);
  });

  it("the short check can be taken back until a lesson is studied, so topics can be chosen again", async () => {
    const c = await learner();
    const undone = await c.call<{ stage: string }>(r.placement.DELETE, "/api/placement", { method: "DELETE" });
    expect(undone.status).toBe(200);
    expect((await c.call<MeResponse>(r.me, "/api/me")).data.stage).toBe("test");
    const q = await c.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
    await c.call(r.placement.POST, "/api/placement", { method: "POST", body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) } });
    await pass(c);
    expect((await c.call(r.placement.DELETE, "/api/placement", { method: "DELETE" })).status).toBe(409);
  });

  it("the plan carries the run to the exam: one day per square from the first day to exam day", async () => {
    const c = await learner();
    await pass(c);
    const plan = await c.call<PlanResponse>(r.plan, "/api/plan");
    const run = plan.data.exam_run;
    expect(run).toHaveLength(15); // today and the 14 days to the exam
    expect(run[0]).toMatchObject({ date: plan.data.today, status: "done", is_today: true });
    expect(run.at(-1)).toMatchObject({ date: plan.data.deadline, is_deadline: true });
    expect(run.slice(1, -1).every((d) => d.status === "planned")).toBe(true);
  });

  it("the first choice of a day stands, so switching cannot write a second lesson", async () => {
    const c = await learner();
    expect((await choose(c, 20)).data.chosen).toBe(20);
    const first = await openLesson(c);
    const again = await choose(c, 10);
    expect(again.data).toMatchObject({ chosen: 20, minutes: 20 });
    const viaQuery = await openLesson(c, "?minutes=30");
    expect(viaQuery.data.lesson_key).toBe(first.data.lesson_key);
    expect(viaQuery.data.order.minutes).toBe(20);
  });

  it("limits the choice to 10 to 30 minutes and rejects anything that is not a whole number", async () => {
    const c = await learner();
    for (const bad of ["20", 12.5, null, -5, 0]) {
      const res = await choose(c, bad);
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.data.code).toBe("bad_minutes");
    }
    expect((await c.call(r.session.POST, "/api/session", { method: "POST", body: {} })).status).toBe(400);
    expect((await openLesson(c, "?minutes=soon")).status).toBe(400);
    expect((await getSession(c)).data.chosen).toBeNull(); // nothing was stored by the rejected requests
    expect((await choose(c, 45)).data).toMatchObject({ chosen: 30, minutes: 30, lessons_in_session: 2, lesson_minutes: 15 });
  });

  it("GET /api/lesson?minutes=NN stores the choice like POST /api/session", async () => {
    const c = await learner(15);
    const lesson = await openLesson(c, "?minutes=20");
    expect(lesson.status).toBe(200);
    expect(lesson.data.order.minutes).toBe(20);
    expect((await getSession(c)).data).toMatchObject({ chosen: 20, ask: false });
  });

  it("without a choice the lesson uses the profile's minutes, and a lesson in progress is not interrupted by the chooser", async () => {
    const c = await learner(20);
    const lesson = await openLesson(c);
    expect(lesson.data.order.minutes).toBe(20);
    // The lesson that was written fixes the day's length: the chooser is not shown and a later choice changes nothing.
    expect((await getSession(c)).data).toMatchObject({ ask: false, chosen: 20, minutes: 20 });
    expect((await choose(c, 10)).data).toMatchObject({ chosen: 20, minutes: 20 });
    expect((await openLesson(c)).data.lesson_key).toBe(lesson.data.lesson_key);
  });

  it("25 minutes or more is two short lessons: the second follows the first on the same day", async () => {
    const c = await learner(15);
    expect((await choose(c, 30)).data).toMatchObject({ lessons_in_session: 2, lesson_minutes: 15, lessons_done_today: 0 });
    const first = await pass(c);
    expect(first.order.minutes).toBe(15);
    const mid = await getSession(c);
    expect(mid.data).toMatchObject({ ask: false, chosen: 30, lessons_in_session: 2, lessons_done_today: 1 });
    expect(mid.data.open_unit_id).not.toBe(first.lesson.unit_id);
    const second = await pass(c);
    expect(second.order.minutes).toBe(15);
    expect(second.lesson.unit_id).toBe(mid.data.open_unit_id);
    expect((await getSession(c)).data.lessons_done_today).toBe(2);
    // The lessons list plans both of today's lessons for today.
    const fresh = await learner(15);
    await choose(fresh, 30);
    const items = (await fresh.call<LessonsResponse>(r.lessons, "/api/lessons")).data.items.filter((i) => i.date_kind === "planned");
    expect(items[0].date).toBe(items[1].date);
    expect(items[2].date).not.toBe(items[0].date);
  });

  it("an unfinished lesson is resumed on a later day, whatever length is chosen then", async () => {
    const c = await learner(15);
    await choose(c, 20);
    const started = await openLesson(c);
    const question = started.data.lesson.quiz[0].question_id;
    await c.call(r.check, "/api/answers/check", { method: "POST", body: { lesson_key: started.data.lesson_key, question_id: question, choice: -1 } });

    await c.call(r.skip, "/api/demo/skip-day", { method: "POST" });
    expect((await getSession(c)).data).toMatchObject({ ask: false, chosen: null });
    await choose(c, 10);
    const resumed = await openLesson(c);
    expect(resumed.data.lesson_key).toBe(started.data.lesson_key);
    expect(resumed.data.order.minutes).toBe(20);
    expect(Object.keys(resumed.data.checked)).toEqual([question]); // the locked answer is still there
  });

  it("a catch-up day does not ask: its lesson is always the short one", async () => {
    const c = await learner(20);
    await pass(c);
    await c.call(r.skip, "/api/demo/skip-day", { method: "POST" });
    await c.call(r.skip, "/api/demo/skip-day", { method: "POST" });
    expect((await getSession(c)).data).toMatchObject({ ask: false, chosen: null });
    const lesson = await openLesson(c);
    expect(lesson.data.order).toMatchObject({ mode: "catch_up", minutes: 10 });
  });

  it("a new day asks again; the demo reset clears the choice", async () => {
    const c = await learner(15);
    await choose(c, 25);
    await pass(c);
    await c.call(r.skip, "/api/demo/skip-day", { method: "POST" });
    const tomorrow = await getSession(c);
    expect(tomorrow.data).toMatchObject({ ask: true, chosen: null, minutes: 15, lessons_done_today: 0 });

    const d = await learner(15);
    await choose(d, 25);
    await d.call(r.reset, "/api/demo/reset", { method: "POST" });
    const me = await d.call<MeResponse>(r.me, "/api/me");
    await d.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.data.today, 15) } });
    const q = await d.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
    await d.call(r.placement.POST, "/api/placement", { method: "POST", body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) } });
    expect((await getSession(d)).data).toMatchObject({ ask: true, chosen: null });
  });

  it("the profile accepts 10 to 30 minutes a day only", async () => {
    const c = new Client(`10.0.1.${ip++}`);
    await c.call(r.generate, "/api/identity/generate", { method: "POST" });
    const me = await c.call<MeResponse>(r.me, "/api/me");
    for (const minutes of [5, 45]) {
      expect((await c.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.data.today, minutes) } })).status).toBe(400);
    }
    expect((await c.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.data.today, 30) } })).status).toBe(200);
  });

  it("needs a signed-in learner who has taken the short test", async () => {
    expect((await getSession(new Client("10.0.1.250"))).status).toBe(401);
    const c = new Client(`10.0.1.${ip++}`);
    await c.call(r.generate, "/api/identity/generate", { method: "POST" });
    expect((await getSession(c)).status).toBe(409); // no profile yet
    const me = await c.call<MeResponse>(r.me, "/api/me");
    await c.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.data.today, 15) } });
    const s = await choose(c, 20);
    expect(s.status).toBe(409);
    expect(s.data.code).toBe("no_placement");
  });
});
