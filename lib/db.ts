// Storage: libSQL (Turso in production, a local file in development).
// Collections: learners (PROJECT §4.5), course_plans (§4.2), lessons (cache), plus a generation log for cost caps.
import "server-only";
import { createClient, type Client } from "@libsql/client";
import type { CoursePlan, LearnerRecord, Lesson, Order } from "./types";
import type { LessonResult } from "./rules";

let client: Client | null = null;
let ready: Promise<void> | null = null;

function connect(): Client {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL || (process.env.VERCEL ? "" : "file:local.db");
  if (!url) throw new Error("TURSO_DATABASE_URL is not set");
  client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || undefined });
  return client;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS learners (
     learner_id TEXT PRIMARY KEY,
     record TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS course_plans (
     course_plan_id TEXT PRIMARY KEY,
     plan TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS lessons (
     lesson_key TEXT PRIMARY KEY,
     learner_id TEXT NOT NULL,
     order_json TEXT NOT NULL,
     lesson TEXT NOT NULL,
     result TEXT,
     created_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS generations (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     learner_id TEXT NOT NULL,
     ip TEXT NOT NULL,
     kind TEXT NOT NULL,
     created_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS generations_created ON generations (created_at)`,
];

async function db(): Promise<Client> {
  const c = connect();
  ready ??= c.batch(SCHEMA, "write").then(() => undefined);
  try {
    await ready;
  } catch (err) {
    ready = null; // let the next request retry the migration
    throw err;
  }
  return c;
}

const nowIso = () => new Date().toISOString();

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
}

export async function loadLesson(key: string): Promise<LessonRow | null> {
  const rs = await (await db()).execute({
    sql: "SELECT lesson_key, learner_id, order_json, lesson, result FROM lessons WHERE lesson_key = ?",
    args: [key],
  });
  if (!rs.rows.length) return null;
  const row = rs.rows[0];
  return {
    lesson_key: String(row.lesson_key),
    learner_id: String(row.learner_id),
    order: JSON.parse(String(row.order_json)) as Order,
    lesson: JSON.parse(String(row.lesson)) as Lesson,
    result: row.result === null ? null : (JSON.parse(String(row.result)) as LessonResult),
  };
}

export async function saveLesson(key: string, learnerId: string, order: Order, lesson: Lesson): Promise<void> {
  await (await db()).execute({
    sql: "INSERT INTO lessons (lesson_key, learner_id, order_json, lesson, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(lesson_key) DO NOTHING",
    args: [key, learnerId, JSON.stringify(order), JSON.stringify(lesson), nowIso()],
  });
}

/** Marks a lesson as graded. Returns false if it was already graded (double submit). */
export async function saveLessonResult(key: string, result: LessonResult): Promise<boolean> {
  const rs = await (await db()).execute({
    sql: "UPDATE lessons SET result = ? WHERE lesson_key = ? AND result IS NULL",
    args: [JSON.stringify(result), key],
  });
  return rs.rowsAffected === 1;
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
