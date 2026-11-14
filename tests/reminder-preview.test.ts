// The reminder preview over the API: which email is due today, and why none is when none is.
// Also the survey's exam date, which must lie after the learner's today.
// Runs the real route handlers against an in-memory database.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { MeResponse, PresentedLesson, ReminderResponse } from "@/lib/api-types";
import { addDays, weekdayOf } from "@/lib/dates";
import { WEEKDAYS } from "@/lib/types";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  me: (await import("@/app/api/me/route")).GET,
  profile: (await import("@/app/api/profile/route")).POST,
  placement: await import("@/app/api/placement/route"),
  lesson: (await import("@/app/api/lesson/route")).GET,
  check: (await import("@/app/api/answers/check/route")).POST,
  answers: (await import("@/app/api/answers/route")).POST,
  reminder: (await import("@/app/api/reminder-preview/route")).GET,
  db: await import("@/lib/db"),
});

let r: Awaited<ReturnType<typeof routes>>;
let ip = 60;

const profileOf = (today: string, overrides: Record<string, unknown> = {}) => ({
  course_title: "PMP exam prep",
  goal: "Move into a project manager role",
  success: "Pass the PMP exam on the first attempt",
  focus: [],
  skip: [],
  minutes_per_day: 15,
  study_days: [...WEEKDAYS],
  deadline: addDays(today, 14),
  prior_knowledge: "Leads projects, self-taught, no formal training",
  blocker: "time",
  blocker_note: "Evenings disappear",
  ...overrides,
});

/** A new learner with the survey saved and the short test answered (every question wrong). */
async function learner(overrides: (me: MeResponse) => Record<string, unknown> = () => ({})): Promise<Client> {
  const c = new Client(`10.0.3.${ip++}`);
  await c.call(r.generate, "/api/identity/generate", { method: "POST" });
  const me = (await c.call<MeResponse>(r.me, "/api/me")).data;
  const saved = await c.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.today, overrides(me)) } });
  expect(saved.status).toBe(200);
  const q = await c.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
  await c.call(r.placement.POST, "/api/placement", { method: "POST", body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) } });
  return c;
}

const preview = async (c: Client) => (await c.call<ReminderResponse>(r.reminder, "/api/reminder-preview")).data;

beforeAll(async () => {
  r = await routes();
});

describe("reminder preview: which email is due today", () => {
  it("a study day with no lesson yet gets the planned-day email; once the lesson is done there is none", async () => {
    const c = await learner();
    expect(await preview(c)).toMatchObject({ today_type: "planned_day", none_reason: null });

    const open = (await c.call<PresentedLesson>(r.lesson, "/api/lesson")).data;
    const row = (await r.db.loadLesson(open.lesson_key))!;
    for (const q of row.lesson.quiz) {
      await c.call(r.check, "/api/answers/check", { method: "POST", body: { lesson_key: row.lesson_key, question_id: q.question_id, choice: q.correct_index } });
    }
    await c.call(r.answers, "/api/answers", { method: "POST", body: { lesson_key: row.lesson_key } });
    expect(await preview(c)).toMatchObject({ today_type: null, none_reason: "studied" });
  });

  it("a rest day gets no email and says so", async () => {
    // Study only on the weekday after today, so today is a rest day with nothing studied.
    const c = await learner((me) => ({ study_days: [weekdayOf(addDays(me.today, 1))] }));
    expect(await preview(c)).toMatchObject({ today_type: null, none_reason: "rest" });
  });

  it("a finished course gets no email", async () => {
    // Every topic marked "I already know it": nothing is left to learn after the short test.
    const c = await learner((me) => ({ skip: (me.course?.units ?? []).map((u) => u.title) }));
    expect((await c.call<MeResponse>(r.me, "/api/me")).data.stage).toBe("done");
    expect(await preview(c)).toMatchObject({ today_type: null, none_reason: "finished" });
  });
});

describe("the survey's exam date", () => {
  it("must be after the learner's today", async () => {
    const c = new Client(`10.0.3.${ip++}`);
    await c.call(r.generate, "/api/identity/generate", { method: "POST" });
    const me = (await c.call<MeResponse>(r.me, "/api/me")).data;
    const save = (deadline: string) => c.call(r.profile, "/api/profile", { method: "POST", body: { profile: profileOf(me.today, { deadline }) } });

    expect(await save(addDays(me.today, -14))).toMatchObject({ status: 400, data: { code: "bad_deadline" } });
    expect(await save(me.today)).toMatchObject({ status: 400, data: { code: "bad_deadline" } });
    expect((await save(addDays(me.today, 1))).status).toBe(200);
  });
});
