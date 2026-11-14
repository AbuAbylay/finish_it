// Versioned schema migrations. Append new steps; never edit a step that has shipped.
// Applied versions are recorded in schema_migrations, each step in its own transaction.

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial collections: learners, course plans, cached lessons, generation log",
    statements: [
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
    ],
  },
  {
    version: 2,
    name: "ID entry: login_id on learners, sessions, auth attempt log; per-question answers on lessons",
    statements: [
      `ALTER TABLE learners ADD COLUMN login_id TEXT`,
      `CREATE UNIQUE INDEX IF NOT EXISTS learners_login_id ON learners (login_id)`,
      `CREATE TABLE IF NOT EXISTS sessions (
         session_hash TEXT PRIMARY KEY,
         learner_id TEXT NOT NULL,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS sessions_learner ON sessions (learner_id)`,
      `CREATE TABLE IF NOT EXISTS auth_attempts (
         id INTEGER PRIMARY KEY AUTOINCREMENT,
         ip TEXT NOT NULL,
         kind TEXT NOT NULL,
         ok INTEGER NOT NULL,
         created_at TEXT NOT NULL
       )`,
      `CREATE INDEX IF NOT EXISTS auth_attempts_ip ON auth_attempts (ip, created_at)`,
      `ALTER TABLE lessons ADD COLUMN answers TEXT`,
      `CREATE INDEX IF NOT EXISTS lessons_learner ON lessons (learner_id)`,
    ],
  },
];

export const LATEST_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;
