// Storage: libSQL (Turso in production, a local file in development).
// Collections: learners (PROJECT §4.5), course_plans (§4.2), lessons (cache), plus sessions,
// auth attempts and a generation log. Schema changes go through lib/migrations.ts.
import "server-only";
import { createClient, type Client } from "@libsql/client";
import { LATEST_VERSION, MIGRATIONS } from "./migrations";
import type { LessonResult } from "./rules";
import type { CoursePlan, LearnerRecord, Lesson, Order } from "./types";

let client: Client | null = null;
let ready: Promise<void> | null = null;

function connect(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "" : "file:local.db");
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return client;
}

async function migrate(c: Client): Promise<void> {
  await c.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)",
  );
  const rs = await c.execute("SELECT version FROM schema_migrations");
  const applied = new Set(rs.rows.map((r) => Number(r.version)));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await c.batch(
      [
        ...m.statements,
        { sql: "INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", args: [m.version, m.name, nowIso()] },
      ],
      "write",
    );
  }
}

async function db(): Promise<Client> {
  const c = connect();
  ready ??= migrate(c);
  try {
    await ready;
  } catch (err) {
    ready = null; // let the next request retry the migration
    throw err;
  }
  return c;
}

const nowIso = () => new Date().toISOString();

// --- health ----------------------------------------------------------------

export async function schemaVersion(): Promise<{ version: number; latest: number }> {
  const rs = await (await db()).execute("SELECT MAX(version) AS v FROM schema_migrations");
  return { version: Number(rs.rows[0].v ?? 0), latest: LATEST_VERSION };
}

// --- learners --------------------------------------------------------------

export async function loadLearner(learnerId: string): Promise<LearnerRecord | null> {
  const rs = await (await db()).execute({ sql: "SELECT record FROM learners WHERE learner_id = ?", args: [learnerId] });
  return rs.rows.length ? (JSON.parse(String(rs.rows[0].record)) as LearnerRecord) : null;
}

export async function saveLearner(record: LearnerRecord): Promise<void> {
  await (await db()).execute({
    sql: `INSERT INTO learners (learner_id, record, updated_at) VALUES (?, ?, ?)
          ON CONFLICT(learner_id) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at`,
    args: [record.learner_id, JSON.stringify(record), nowIso()],
  });
}

/** Inserts a new learner with its login ID. Returns false if the login ID is already taken. */
export async function createLearner(record: LearnerRecord, loginId: string): Promise<boolean> {
  try {
    await (await db()).execute({
      sql: "INSERT INTO learners (learner_id, record, updated_at, login_id) VALUES (?, ?, ?, ?)",
      args: [record.learner_id, JSON.stringify(record), nowIso(), loginId],
    });
    return true;
  } catch (err) {
    if (/UNIQUE|constraint/i.test(String(err))) return false;
    throw err;
  }
}

export async function learnerIdByLoginId(loginId: string): Promise<string | null> {
  const rs = await (await db()).execute({ sql: "SELECT learner_id FROM learners WHERE login_id = ?", args: [loginId] });
  return rs.rows.length ? String(rs.rows[0].learner_id) : null;
}

export async function loginIdOf(learnerId: string): Promise<string | null> {
  const rs = await (await db()).execute({ sql: "SELECT login_id FROM learners WHERE learner_id = ?", args: [learnerId] });
  return rs.rows.length && rs.rows[0].login_id !== null ? String(rs.rows[0].login_id) : null;
}

// --- sessions and auth attempts ---------------------------------------------

export async function insertSession(sessionHash: string, learnerId: string): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO sessions (session_hash, learner_id, created_at) VALUES (?, ?, ?)",
    args: [sessionHash, learnerId, nowIso()],
  });
}

export async function learnerIdBySession(sessionHash: string): Promise<string | null> {
  const rs = await (await db()).execute({ sql: "SELECT learner_id FROM sessions WHERE session_hash = ?", args: [sessionHash] });
  return rs.rows.length ? String(rs.rows[0].learner_id) : null;
}

export async function deleteSession(sessionHash: string): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM sessions WHERE session_hash = ?", args: [sessionHash] });
}

export async function logAuthAttempt(ip: string, kind: "enter" | "generate", ok: boolean): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO auth_attempts (ip, kind, ok, created_at) VALUES (?, ?, ?, ?)",
    args: [ip, kind, ok ? 1 : 0, nowIso()],
  });
}

export async function countAuthAttempts(ip: string, kind: "enter" | "generate", since: string, onlyFailed = false): Promise<number> {
  const rs = await (await db()).execute({
    sql: `SELECT COUNT(*) AS n FROM auth_attempts WHERE ip = ? AND kind = ? AND created_at >= ?${onlyFailed ? " AND ok = 0" : ""}`,
    args: [ip, kind, since],
  });
  return Number(rs.rows[0].n);
}

// --- course plans ----------------------------------------------------------

export async function loadPlan(planId: string): Promise<CoursePlan | null> {
  const rs = await (await db()).execute({ sql: "SELECT plan FROM course_plans WHERE course_plan_id = ?", args: [planId] });
  return rs.rows.length ? (JSON.parse(String(rs.rows[0].plan)) as CoursePlan) : null;
}

/** Plans are immutable: the id is derived from the content, so an existing id is left as is. */
export async function savePlan(planId: string, plan: CoursePlan): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO course_plans (course_plan_id, plan, created_at) VALUES (?, ?, ?) ON CONFLICT(course_plan_id) DO NOTHING",
    args: [planId, JSON.stringify(plan), nowIso()],
  });
}

// --- lessons (cache) -------------------------------------------------------

export interface LessonRow {
  lesson_key: string;
  learner_id: string;
  order: Order;
  lesson: Lesson;
  result: LessonResult | null;
  /** Answers checked one question at a time, locked once given: question_id -> original option index. */
  answers: Record<string, number>;
}

const LESSON_COLUMNS = "lesson_key, learner_id, order_json, lesson, result, answers";

function toLessonRow(row: Record<string, unknown>): LessonRow {
  return {
    lesson_key: String(row.lesson_key),
    learner_id: String(row.learner_id),
    order: JSON.parse(String(row.order_json)) as Order,
    lesson: JSON.parse(String(row.lesson)) as Lesson,
    result: row.result === null ? null : (JSON.parse(String(row.result)) as LessonResult),
    answers: row.answers === null || row.answers === undefined ? {} : (JSON.parse(String(row.answers)) as Record<string, number>),
  };
}

export async function loadLesson(key: string): Promise<LessonRow | null> {
  const rs = await (await db()).execute({ sql: `SELECT ${LESSON_COLUMNS} FROM lessons WHERE lesson_key = ?`, args: [key] });
  return rs.rows.length ? toLessonRow(rs.rows[0] as Record<string, unknown>) : null;
}

/** The most recent graded lesson a learner had on a unit, for re-reading. */
export async function latestGradedLesson(learnerId: string, unitId: string): Promise<LessonRow | null> {
  const rs = await (await db()).execute({
    sql: `SELECT ${LESSON_COLUMNS} FROM lessons
          WHERE learner_id = ? AND json_extract(order_json, '$.unit.unit_id') = ? AND result IS NOT NULL
          ORDER BY created_at DESC LIMIT 1`,
    args: [learnerId, unitId],
  });
  return rs.rows.length ? toLessonRow(rs.rows[0] as Record<string, unknown>) : null;
}

export async function saveLesson(key: string, learnerId: string, order: Order, lesson: Lesson): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO lessons (lesson_key, learner_id, order_json, lesson, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(lesson_key) DO NOTHING",
    args: [key, learnerId, JSON.stringify(order), JSON.stringify(lesson), nowIso()],
  });
}

/**
 * Locks in one answer. Returns false when the question was already answered (the first answer stands)
 * or the lesson is already graded.
 */
export async function recordAnswer(key: string, questionId: string, choice: number): Promise<boolean> {
  const c = await db();
  const row = await loadLesson(key);
  if (!row || row.result || questionId in row.answers) return false;
  const next = JSON.stringify({ ...row.answers, [questionId]: choice });
  // Compare-and-set on the previous value so two concurrent answers cannot both win.
  const rs = await c.execute({
    sql: "UPDATE lessons SET answers = ? WHERE lesson_key = ? AND result IS NULL AND COALESCE(answers, '{}') = ?",
    args: [next, key, JSON.stringify(row.answers)],
  });
  return rs.rowsAffected === 1;
}

/** Marks a lesson as graded. Returns false if it was already graded (double submit). */
export async function saveLessonResult(key: string, result: LessonResult): Promise<boolean> {
  const rs = await (await db()).execute({
    sql: "UPDATE lessons SET result = ? WHERE lesson_key = ? AND result IS NULL",
    args: [JSON.stringify(result), key],
  });
  return rs.rowsAffected === 1;
}

/** Demo reset: a learner's cached lessons go with their progress. */
export async function deleteLessonsOf(learnerId: string): Promise<void> {
  await (await db()).execute({ sql: "DELETE FROM lessons WHERE learner_id = ?", args: [learnerId] });
}

// --- generation log (cost caps) --------------------------------------------

export async function countGenerations(since: string, by: { learnerId?: string; ip?: string } = {}): Promise<number> {
  const where = ["created_at >= ?"];
  const args: string[] = [since];
  if (by.learnerId) {
    where.push("learner_id = ?");
    args.push(by.learnerId);
  }
  if (by.ip) {
    where.push("ip = ?");
    args.push(by.ip);
  }
  const rs = await (await db()).execute({ sql: `SELECT COUNT(*) AS n FROM generations WHERE ${where.join(" AND ")}`, args });
  return Number(rs.rows[0].n);
}

export async function logGeneration(learnerId: string, ip: string, kind: "lesson" | "setup" | "chat"): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO generations (learner_id, ip, kind, created_at) VALUES (?, ?, ?, ?)",
    args: [learnerId, ip, kind, nowIso()],
  });
}
