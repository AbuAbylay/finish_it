// Shared plumbing for API routes: request context, the learner's today(), cost caps, presenters.
import "server-only";
import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { today } from "./dates";
import { countGenerations, loadLearner, loadPlan, logGeneration } from "./db";
import { HttpError } from "./http";
import { resolveLearner } from "./identity";
import { checkAnswer, type LessonResult, type QuestionResult } from "./rules";
import type { CoursePlan, LearnerRecord, Lesson, Order, Question } from "./types";

export interface Ctx {
  learnerId: string;
  record: LearnerRecord | null;
  plan: CoursePlan | null;
  /** The learner's today: real date in their time zone + demo_day_offset. */
  today: string;
  timeZone: string;
}

export { HttpError, clientIp, json, readJson, route } from "./http";

export function timeZoneOf(req: NextRequest): string {
  const tz = req.headers.get("x-timezone") ?? "UTC";
  return /^[A-Za-z_+\-/0-9]{1,64}$/.test(tz) ? tz : "UTC";
}

/** An opaque per-learner key the browser may use for drafts and stable option shuffles. Not the ID. */
export function clientKey(learnerId: string): string {
  return createHash("sha256").update(`client:${learnerId}`).digest("hex").slice(0, 16);
}

/** Request context for a signed-in learner. Throws 401 when signed out. */
export async function context(req: NextRequest): Promise<Ctx> {
  const learnerId = await resolveLearner(req);
  if (!learnerId) throw new HttpError(401, "Enter your ID to continue.", "signed_out");
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

/**
 * Throws a friendly 429 when a learner, an IP or the whole app is over its rolling 24-hour cap.
 * Learner and IP caps count successful calls only, so a failing model cannot lock a juror or a
 * shared network out. The global cap counts every attempt, which still bounds total spend.
 */
export async function assertUnderCaps(learnerId: string, ip: string): Promise<void> {
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
}

/** Logs one model call after it returns: its kind on success, "failed" otherwise. */
export async function recordGeneration(learnerId: string, ip: string, kind: "lesson" | "setup" | "chat", ok: boolean): Promise<void> {
  await logGeneration(learnerId, ip, ok ? kind : "failed");
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

/** Feedback for questions already answered: from the result once graded, else from answers checked one at a time. */
function checkedOf(lesson: Lesson, result: LessonResult | null, answers: Record<string, number>): Record<string, QuestionResult> {
  if (result) return Object.fromEntries([...result.quiz, ...result.review_quiz].map((r) => [r.question_id, r]));
  const out: Record<string, QuestionResult> = {};
  for (const q of [...lesson.quiz, ...lesson.review_quiz]) {
    if (q.question_id in answers) out[q.question_id] = checkAnswer(q, answers[q.question_id]);
  }
  return out;
}

export function presentLesson(key: string, order: Order, lesson: Lesson, result: LessonResult | null, answers: Record<string, number> = {}) {
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
    checked: checkedOf(lesson, result, answers),
    result,
  };
}

export type PresentedLesson = ReturnType<typeof presentLesson>;
