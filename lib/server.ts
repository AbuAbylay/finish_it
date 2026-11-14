// Shared plumbing for API routes: learner identity, the learner's today(), errors, cost caps, presenters.
import "server-only";
import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { today } from "./dates";
import { countGenerations, loadLearner, loadPlan, logGeneration } from "./db";
import type { LessonResult } from "./rules";
import type { CoursePlan, LearnerRecord, Lesson, Order, Question } from "./types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

/** Wraps a route handler so every failure comes back as a JSON error object the page can show. */
export function route(handler: (req: NextRequest) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message, code: err.code }, err.status);
      console.error(err);
      return json({ error: "Something went wrong on our side. Please try again.", code: "server_error" }, 500);
    }
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function learnerIdOf(req: NextRequest): string {
  const id = req.headers.get("x-learner-id") ?? "";
  if (!UUID.test(id)) throw new HttpError(400, "Missing or invalid learner id.", "bad_learner");
  return id.toLowerCase();
}

export function timeZoneOf(req: NextRequest): string {
  const tz = req.headers.get("x-timezone") ?? "UTC";
  return /^[A-Za-z_+\-/0-9]{1,64}$/.test(tz) ? tz : "UTC";
}

export function clientIp(req: NextRequest): string {
  return (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function readJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "The request body is not valid JSON.", "bad_json");
  }
}

export interface Ctx {
  learnerId: string;
  record: LearnerRecord | null;
  plan: CoursePlan | null;
  /** The learner's today: real date in their time zone + demo_day_offset. */
  today: string;
  timeZone: string;
}

export async function context(req: NextRequest): Promise<Ctx> {
  const learnerId = learnerIdOf(req);
  const timeZone = timeZoneOf(req);
  const record = await loadLearner(learnerId);
  const plan = record?.course_plan_id ? await loadPlan(record.course_plan_id) : null;
  return { learnerId, record, plan, timeZone, today: today(record?.demo_day_offset ?? 0, timeZone) };
}

/** Narrows a context to a learner who has picked a course and filled in the survey. */
export function requireSetUp(ctx: Ctx): Ctx & { record: LearnerRecord; plan: CoursePlan } {
  if (!ctx.record || !ctx.plan) throw new HttpError(409, "Start with a course first.", "no_course");
  if (!ctx.record.profile) throw new HttpError(409, "Answer the eight setup questions first.", "no_profile");
  return ctx as Ctx & { record: LearnerRecord; plan: CoursePlan };
}

// --- cost protection -------------------------------------------------------

const cap = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Throws a friendly 429 when a learner, an IP or the whole app is over its rolling 24-hour cap. Logs the call otherwise. */
export async function spendGeneration(learnerId: string, ip: string, kind: "lesson" | "setup" | "chat"): Promise<void> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [byLearner, byIp, total] = await Promise.all([
    countGenerations(since, { learnerId }),
    countGenerations(since, { ip }),
    countGenerations(since),
  ]);
  if (byLearner >= cap("LESSON_CAP_PER_LEARNER", 25) || byIp >= cap("LESSON_CAP_PER_IP", 150)) {
    throw new HttpError(429, "You've reached today's limit for new lessons on this demo. Your progress is saved; come back tomorrow.", "rate_limited");
  }
  if (total >= cap("LESSON_CAP_GLOBAL", 1000)) {
    throw new HttpError(429, "The demo has reached its daily limit for new lessons. Your progress is saved; please try again later.", "rate_limited");
  }
  await logGeneration(learnerId, ip, kind);
}

// --- lessons ----------------------------------------------------------------

/** Cache key: one lesson per learner, plan, unit, mode, minutes, review concepts and attempt number on the unit. */
export function lessonKey(record: LearnerRecord, order: Order): string {
  const attempt = record.sessions.filter((s) => s.unit_id === order.unit.unit_id).length;
  const reviews = order.review_concepts.map((rc) => `${rc.unit_id}:${rc.concept}`).sort();
  const raw = JSON.stringify([record.learner_id, record.course_plan_id, order.unit.unit_id, order.mode, order.minutes, reviews, attempt]);
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export type PublicQuestion = Pick<Question, "question_id" | "concept" | "prompt" | "options">;

/** Strips everything that gives the answer away: correct_index, explanation and the question's source quote. */
export function publicQuestion(q: Question): PublicQuestion {
  return { question_id: q.question_id, concept: q.concept, prompt: q.prompt, options: q.options };
}

export function presentLesson(key: string, order: Order, lesson: Lesson, result: LessonResult | null) {
  return {
    lesson_key: key,
    order: {
      mode: order.mode,
      minutes: order.minutes,
      why: order.why,
      unit: { unit_id: order.unit.unit_id, title: order.unit.title, objective: order.unit.objective },
      review_concepts: order.review_concepts.map((rc) => ({ concept: rc.concept, unit_id: rc.unit_id })),
    },
    lesson: {
      unit_id: lesson.unit_id,
      title: lesson.title,
      sections: lesson.sections,
      key_points: lesson.key_points,
      quiz: lesson.quiz.map(publicQuestion),
      review_quiz: lesson.review_quiz.map(publicQuestion),
    },
    result,
  };
}

export type PresentedLesson = ReturnType<typeof presentLesson>;
