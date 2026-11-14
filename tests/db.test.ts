// Storage round-trip against an in-memory libSQL database.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

beforeAll(() => {
  process.env.TURSO_DATABASE_URL = ":memory:";
});

describe("storage", () => {
  it("a learner record round-trips through save and load unchanged", async () => {
    const { loadLearner, saveLearner } = await import("@/lib/db");
    const record = {
      learner_id: "b7c1e0de-0000-4000-8000-000000000000",
      email: null,
      profile: {
        course_title: "PMP exam prep",
        goal: "Move into a project manager role",
        success: "Pass on the first attempt",
        focus: ["risk management"],
        skip: [],
        minutes_per_day: 15,
        study_days: ["mon", "tue"] as ("mon" | "tue")[],
        deadline: "2027-02-20",
        prior_knowledge: "Two years coordinating projects",
        blocker: "time" as const,
        blocker_note: "Evenings disappear",
      },
      course_plan_id: "sample-abc",
      units: { u01: { status: "known" as const, score: 1, last_seen: "2026-11-15" } },
      missed_concepts: [{ concept: "project vs operations", unit_id: "u01", times_missed: 1, interval_step: 0, review_due: "2026-11-16" }],
      sessions: [{ date: "2026-11-15", unit_id: "u01", mode: "new" as const, score: 0.67 }],
      last_active: "2026-11-15",
      streak: 1,
      demo_day_offset: 2,
    };
    expect(await loadLearner(record.learner_id)).toBeNull();
    await saveLearner(record);
    expect(await loadLearner(record.learner_id)).toEqual(record);
    await saveLearner({ ...record, streak: 2 });
    expect((await loadLearner(record.learner_id))?.streak).toBe(2);
  });

  it("caches lessons and grades each one only once", async () => {
    const { loadLesson, saveLesson, saveLessonResult } = await import("@/lib/db");
    const order = {
      mode: "new" as const,
      minutes: 15,
      unit: { unit_id: "u01", title: "t", objective: "o", excerpt: "e" },
      learner: { goal: "g", focus: [], prior_knowledge: "p" },
      review_concepts: [],
      why: "w",
    };
    const lesson = { unit_id: "u01", title: "t", sections: [], key_points: [], quiz: [], review_quiz: [] };
    await saveLesson("k1", "l1", order, lesson);
    expect(await loadLesson("k1")).toEqual({ lesson_key: "k1", learner_id: "l1", order, lesson, result: null, answers: {} });
    const result = { unit_id: "u01", mode: "new" as const, score: 1, status: "done" as const, quiz: [], review_quiz: [], coming_back: [] };
    expect(await saveLessonResult("k1", result)).toBe(true);
    expect(await saveLessonResult("k1", result)).toBe(false);
    expect((await loadLesson("k1"))?.result).toEqual(result);
  });

  it("counts generations for the cost caps", async () => {
    const { countGenerations, logGeneration } = await import("@/lib/db");
    const since = new Date(Date.now() - 60_000).toISOString();
    await logGeneration("l1", "1.1.1.1", "lesson");
    await logGeneration("l2", "1.1.1.1", "lesson");
    expect(await countGenerations(since, { learnerId: "l1" })).toBe(1);
    expect(await countGenerations(since, { ip: "1.1.1.1" })).toBe(2);
    expect(await countGenerations(since)).toBe(2);
    // A failed model call counts toward the global total only, so it cannot lock a learner or a network out.
    await logGeneration("l1", "1.1.1.1", "failed");
    expect(await countGenerations(since, { learnerId: "l1" })).toBe(1);
    expect(await countGenerations(since, { ip: "1.1.1.1" })).toBe(2);
    expect(await countGenerations(since)).toBe(3);
  });
});

describe("migrations", () => {
  it("are versioned, applied once, and leave the schema at the latest version", async () => {
    const { schemaVersion, createLearner, learnerIdByLoginId, loginIdOf } = await import("@/lib/db");
    const { LATEST_VERSION } = await import("@/lib/migrations");
    expect(await schemaVersion()).toEqual({ version: LATEST_VERSION, latest: LATEST_VERSION });
    const rec = { learner_id: "l-mig", email: null, profile: null, course_plan_id: null, units: {}, missed_concepts: [], sessions: [], last_active: null, streak: 0, demo_day_offset: 0 };
    expect(await createLearner(rec, "abcde-fghjk")).toBe(true);
    expect(await createLearner({ ...rec, learner_id: "l-mig-2" }, "abcde-fghjk")).toBe(false); // login_id is unique
    expect(await learnerIdByLoginId("abcde-fghjk")).toBe("l-mig");
    expect(await loginIdOf("l-mig")).toBe("abcde-fghjk");
  });
});
