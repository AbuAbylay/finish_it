// Grading is one transaction: the lesson result and the learner record are saved together or not at all,
// and a lesson is graded once however many times it is submitted. Runs the real handlers against a
// database file, so a second connection can inject write failures with triggers.
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient, type Client as Database } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { AnswersResponse, MeResponse, PresentedLesson } from "@/lib/api-types";
import { addDays } from "@/lib/dates";

vi.mock("server-only", () => ({}));
const dir = mkdtempSync(path.join(os.tmpdir(), "fic-grading-"));
const url = `file:${path.join(dir, "grading.db")}`;
process.env.TURSO_DATABASE_URL = url;

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  me: (await import("@/app/api/me/route")).GET,
  profile: (await import("@/app/api/profile/route")).POST,
  placement: await import("@/app/api/placement/route"),
  lesson: (await import("@/app/api/lesson/route")).GET,
  check: (await import("@/app/api/answers/check/route")).POST,
  answers: (await import("@/app/api/answers/route")).POST,
  db: await import("@/lib/db"),
});

let r: Awaited<ReturnType<typeof routes>>;
let side: Database;
let nextIp = 1;

/** A new learner past the survey and the short test, with every question of the open lesson answered. */
async function readyToGrade() {
  const client = new Client(`10.2.0.${nextIp++}`);
  await client.call(r.generate, "/api/identity/generate", { method: "POST" });
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
        prior_knowledge: "Leads projects, self-taught",
        blocker: "time",
        blocker_note: "",
      },
    },
  });
  const q = await client.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
  await client.call(r.placement.POST, "/api/placement", {
    method: "POST",
    body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) },
  });
  const lesson = await client.call<PresentedLesson>(r.lesson, "/api/lesson");
  expect(lesson.status).toBe(200);
  const row = (await r.db.loadLesson(lesson.data.lesson_key))!;
  for (const question of [...row.lesson.quiz, ...row.lesson.review_quiz]) {
    const checked = await client.call(r.check, "/api/answers/check", {
      method: "POST",
      body: { lesson_key: row.lesson_key, question_id: question.question_id, choice: question.correct_index },
    });
    expect(checked.status).toBe(200);
  }
  return { client, key: row.lesson_key, learnerId: row.learner_id, unitId: row.order.unit.unit_id };
}

const grade = (client: Client, key: string) =>
  client.call<AnswersResponse>(r.answers, "/api/answers", { method: "POST", body: { lesson_key: key } });

async function stored(key: string, learnerId: string) {
  const [lesson, record] = await Promise.all([r.db.loadLesson(key), r.db.loadLearner(learnerId)]);
  return { result: lesson!.result, sessions: record!.sessions, record: record! };
}

beforeAll(async () => {
  r = await routes();
  await r.db.schemaVersion(); // runs the migrations before the second connection opens the file
  side = createClient({ url });
});

afterAll(() => {
  side.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("grading writes the lesson result and the learner record together", () => {
  it("saves both on a normal submit", async () => {
    const { client, key, learnerId, unitId } = await readyToGrade();
    const res = await grade(client, key);
    expect(res.status).toBe(200);
    expect(res.data.already_graded).toBe(false);

    const now = await stored(key, learnerId);
    expect(now.result).toEqual(res.data.result);
    expect(now.sessions).toHaveLength(1);
    expect(now.sessions[0].unit_id).toBe(unitId);
    expect(now.record.units[unitId].status).toBe("done");
  });

  it("grades once when the same lesson is submitted twice at the same moment", async () => {
    const { client, key, learnerId } = await readyToGrade();
    const save = vi.spyOn(r.db, "saveGrading");
    const [a, b] = await Promise.all([grade(client, key), grade(client, key)]);
    // Both requests saw an ungraded lesson and tried to save; the database let one through.
    expect(await Promise.all(save.mock.results.map((call) => call.value))).toEqual([true, false]);
    save.mockRestore();
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.data.already_graded, b.data.already_graded].sort()).toEqual([false, true]);
    expect(a.data.result).toEqual(b.data.result);
    // Both answers describe the record as it is after the one grading.
    expect(a.data.pace).toEqual(b.data.pace);

    const now = await stored(key, learnerId);
    expect(now.sessions).toHaveLength(1);

    const again = await grade(client, key);
    expect(again.data.already_graded).toBe(true);
    expect((await stored(key, learnerId)).sessions).toHaveLength(1);
  });

  it("does not touch the record when the lesson is already graded", async () => {
    const { client, key, learnerId } = await readyToGrade();
    await grade(client, key);
    const before = await stored(key, learnerId);

    const tampered = { ...before.record, streak: 99, sessions: [...before.record.sessions, ...before.record.sessions] };
    expect(await r.db.saveGrading(key, before.result!, tampered)).toBe(false);

    const after = await stored(key, learnerId);
    expect(after.record).toEqual(before.record);
    expect(after.result).toEqual(before.result);
  });

  it("does not grade a lesson for a record that belongs to someone else", async () => {
    const mine = await readyToGrade();
    const other = await readyToGrade();
    const theirs = await stored(other.key, other.learnerId);
    const graded = await grade(other.client, other.key);

    // The other learner's record with my ungraded lesson: neither row may change.
    expect(await r.db.saveGrading(mine.key, graded.data.result, theirs.record)).toBe(false);
    expect((await stored(mine.key, mine.learnerId)).result).toBeNull();
    expect((await stored(mine.key, mine.learnerId)).sessions).toHaveLength(0);
  });

  it("keeps the record unchanged when the lesson result cannot be written, and a retry then works", async () => {
    const { client, key, learnerId } = await readyToGrade();
    const before = await stored(key, learnerId);
    await side.execute("CREATE TRIGGER fail_result BEFORE UPDATE OF result ON lessons BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await grade(client, key);
      expect(failed.status).toBe(500);
      expect(failed.data.code).toBe("server_error");
    } finally {
      await side.execute("DROP TRIGGER fail_result");
      quiet.mockRestore();
    }
    const mid = await stored(key, learnerId);
    expect(mid.result).toBeNull();
    expect(mid.record).toEqual(before.record); // no session without a graded lesson

    const retry = await grade(client, key);
    expect(retry.status).toBe(200);
    expect(retry.data.already_graded).toBe(false);
    expect((await stored(key, learnerId)).sessions).toHaveLength(1);
  });

  it("leaves the lesson ungraded when the record cannot be written, and a retry then works", async () => {
    const { client, key, learnerId } = await readyToGrade();
    await side.execute("CREATE TRIGGER fail_record BEFORE UPDATE OF record ON learners BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const failed = await grade(client, key);
      expect(failed.status).toBe(500);
    } finally {
      await side.execute("DROP TRIGGER fail_record");
      quiet.mockRestore();
    }
    const mid = await stored(key, learnerId);
    expect(mid.result).toBeNull(); // no graded lesson without its session
    expect(mid.sessions).toHaveLength(0);

    const retry = await grade(client, key);
    expect(retry.status).toBe(200);
    expect(retry.data.already_graded).toBe(false);
    const after = await stored(key, learnerId);
    expect(after.result).toEqual(retry.data.result);
    expect(after.sessions).toHaveLength(1);
  });
});
