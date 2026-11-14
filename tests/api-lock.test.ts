// Route-level proof of locked lessons: a locked unit cannot be fetched, answered or graded
// by changing the URL or the request. Runs the real handlers against an in-memory database.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { LessonsResponse, MeResponse, PresentedLesson, RereadResponse } from "@/lib/api-types";
import { addDays } from "@/lib/dates";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  me: (await import("@/app/api/me/route")).GET,
  profile: (await import("@/app/api/profile/route")).POST,
  placement: await import("@/app/api/placement/route"),
  lessons: (await import("@/app/api/lessons/route")).GET,
  lesson: (await import("@/app/api/lesson/route")).GET,
  check: (await import("@/app/api/answers/check/route")).POST,
  answers: (await import("@/app/api/answers/route")).POST,
  db: await import("@/lib/db"),
});

let r: Awaited<ReturnType<typeof routes>>;
const learner = new Client("10.0.0.1");

/** Signs a client in with a new ID, fills in the survey and answers every short-test question wrong. */
async function setUp(client: Client) {
  const gen = await client.call(r.generate, "/api/identity/generate", { method: "POST" });
  expect(gen.status).toBe(200);
  const me = await client.call<MeResponse>(r.me, "/api/me");
  await client.call(r.profile, "/api/profile", {
    method: "POST",
    body: {
      profile: {
        course_title: "PMP exam prep",
        goal: "Move into a project manager role",
        success: "Pass the PMP exam on the first attempt",
        focus: [],
        skip: [],
        minutes_per_day: 15,
        study_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        deadline: addDays(me.data.today, 14),
        prior_knowledge: "Leads projects, self-taught, no formal training",
        blocker: "time",
        blocker_note: "Evenings disappear",
      },
    },
  });
  const q = await client.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
  const graded = await client.call(r.placement.POST, "/api/placement", {
    method: "POST",
    body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) },
  });
  expect(graded.status).toBe(200);
}

beforeAll(async () => {
  r = await routes();
  await setUp(learner);
});

async function states() {
  const res = await learner.call<LessonsResponse>(r.lessons, "/api/lessons");
  return res.data.items.map((i) => i.state);
}

/** Answers the open lesson through the check endpoint: correctly, or wrong on purpose. */
async function finishOpenLesson(correct: boolean) {
  const res = await learner.call<PresentedLesson>(r.lesson, "/api/lesson");
  const row = (await r.db.loadLesson(res.data.lesson_key))!;
  for (const q of [...row.lesson.quiz, ...row.lesson.review_quiz]) {
    const choice = correct ? q.correct_index : (q.correct_index + 1) % q.options.length;
    const c = await learner.call(r.check, "/api/answers/check", { method: "POST", body: { lesson_key: row.lesson_key, question_id: q.question_id, choice } });
    expect(c.status).toBe(200);
  }
  const graded = await learner.call<{ result: { score: number; status: string } }>(r.answers, "/api/answers", {
    method: "POST",
    body: { lesson_key: row.lesson_key },
  });
  expect(graded.status).toBe(200);
  return { key: row.lesson_key, result: graded.data.result };
}

describe("locked lessons over the API", () => {
  it("exactly one lesson is open after the short test", async () => {
    const s = await states();
    expect(s.filter((x) => x === "next")).toHaveLength(1);
    expect(s[0]).toBe("next");
    expect(s.slice(1).every((x) => x === "locked")).toBe(true);
  });

  it("a locked unit cannot be fetched by changing the URL", async () => {
    const res = await learner.call(r.lesson, "/api/lesson?unit=u03");
    expect(res.status).toBe(403);
    expect(res.data.code).toBe("locked");
    expect(res.data.error).toMatch(/unlocks after you pass/);
    const unknown = await learner.call(r.lesson, "/api/lesson?unit=u99");
    expect(unknown.status).toBe(404);
  });

  it("a lesson for a locked unit cannot be fetched, answered or graded by key", async () => {
    // Plant a lesson row for a locked unit, as if its key had been guessed or kept from earlier.
    const open = await learner.call<PresentedLesson>(r.lesson, "/api/lesson");
    const row = (await r.db.loadLesson(open.data.lesson_key))!;
    const forgedKey = "forged-locked-lesson";
    await r.db.saveLesson(forgedKey, row.learner_id, { ...row.order, unit: { ...row.order.unit, unit_id: "u04" } }, { ...row.lesson, unit_id: "u04" });

    expect((await learner.call(r.lesson, `/api/lesson?key=${forgedKey}`)).status).toBe(403);
    const q = row.lesson.quiz[0];
    const check = await learner.call(r.check, "/api/answers/check", { method: "POST", body: { lesson_key: forgedKey, question_id: q.question_id, choice: 0 } });
    expect(check.status).toBe(403);
    const grade = await learner.call(r.answers, "/api/answers", { method: "POST", body: { lesson_key: forgedKey, answers: { [q.question_id]: q.correct_index } } });
    expect(grade.status).toBe(403);
    const after = await states();
    expect(after[0]).toBe("next");
    expect(after.slice(1).every((x) => x === "locked")).toBe(true);
  });

  it("another learner's lesson is not found, and a signed-out request is refused", async () => {
    const other = new Client("10.0.0.2");
    await setUp(other);
    const open = await learner.call<PresentedLesson>(r.lesson, "/api/lesson");
    expect((await other.call(r.lesson, `/api/lesson?key=${open.data.lesson_key}`)).status).toBe(404);
    const q = open.data.lesson.quiz[0];
    expect((await other.call(r.check, "/api/answers/check", { method: "POST", body: { lesson_key: open.data.lesson_key, question_id: q.question_id, choice: 0 } })).status).toBe(404);
    expect((await new Client("10.0.0.3").call(r.lesson, "/api/lesson")).status).toBe(401);
  });

  it("the first checked answer is locked in", async () => {
    const open = await learner.call<PresentedLesson>(r.lesson, "/api/lesson");
    const q = open.data.lesson.quiz[0];
    const first = await learner.call<{ feedback: { chosen: number }; already_answered: boolean }>(r.check, "/api/answers/check", {
      method: "POST",
      body: { lesson_key: open.data.lesson_key, question_id: q.question_id, choice: 1 },
    });
    const second = await learner.call<{ feedback: { chosen: number }; already_answered: boolean }>(r.check, "/api/answers/check", {
      method: "POST",
      body: { lesson_key: open.data.lesson_key, question_id: q.question_id, choice: 2 },
    });
    expect(first.data.already_answered).toBe(false);
    expect(second.data).toMatchObject({ already_answered: true, feedback: { chosen: 1 } });
    const again = await learner.call<PresentedLesson>(r.lesson, "/api/lesson");
    expect(again.data.checked[q.question_id].chosen).toBe(1);
    // Questions not yet answered still carry no answer key.
    expect(again.data.lesson.quiz.every((x) => !("correct_index" in x))).toBe(true);
  });

  it("failing keeps the same unit open as a review; passing unlocks the next unit", async () => {
    const failed = await finishOpenLesson(false);
    expect(failed.result.status).toBe("needs_review");
    let list = await learner.call<LessonsResponse>(r.lessons, "/api/lessons");
    expect(list.data.items[0]).toMatchObject({ state: "next", mode: "review" });
    expect(list.data.items[1].state).toBe("locked");

    const passed = await finishOpenLesson(true);
    expect(passed.result.status).toBe("done");
    list = await learner.call<LessonsResponse>(r.lessons, "/api/lessons");
    expect(list.data.items.slice(0, 3).map((i) => i.state)).toEqual(["done", "next", "locked"]);
  });

  it("a done unit can be re-read and re-reading does not change the record", async () => {
    const meBefore = await learner.call<MeResponse>(r.me, "/api/me");
    const before = await r.db.loadLearner((await r.db.learnerIdByLoginId(meBefore.data.login_id!))!);
    const res = await learner.call<RereadResponse>(r.lesson, "/api/lesson?unit=u01");
    expect(res.status).toBe(200);
    expect(res.data.reread).toBe(true);
    expect(res.data.lesson?.result?.status).toBe("done");
    const after = await r.db.loadLearner(before!.learner_id);
    expect(after).toEqual(before);
  });
});
