import { writeLesson } from "@/ai";
import { parseLesson } from "@/lib/contracts";
import { loadLesson, saveLesson, type LessonRow } from "@/lib/db";
import { pickNext, placementDone } from "@/lib/rules";
import {
  HttpError,
  clientIp,
  context,
  json,
  lessonKey,
  presentLesson,
  requireSetUp,
  route,
  spendGeneration,
} from "@/lib/server";
import { isAiError, type Order } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Requests for the same lesson that arrive together share one model call (per server instance).
const inflight = new Map<string, Promise<LessonRow>>();

async function generate(key: string, learnerId: string, ip: string, order: Order): Promise<LessonRow> {
  await spendGeneration(learnerId, ip, "lesson");
  const out = await writeLesson(order);
  if (isAiError(out)) throw new HttpError(502, out.error || "The lesson could not be written. Please try again.", "ai_error");
  const parsed = parseLesson(out);
  if (!parsed.ok) {
    console.error("lesson contract mismatch", parsed.error);
    throw new HttpError(502, "The lesson came back in an unexpected shape. Please try again.", "ai_error");
  }
  await saveLesson(key, learnerId, order, parsed.lesson);
  return { lesson_key: key, learner_id: learnerId, order, lesson: parsed.lesson, result: null };
}

/**
 * GET /api/lesson         -> picks the next unit, returns the cached lesson or writes a new one.
 * GET /api/lesson?key=... -> a lesson this learner already has (with its result once graded).
 */
export const GET = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const row = await loadLesson(key);
    if (!row || row.learner_id !== ctx.learnerId) throw new HttpError(404, "Lesson not found.", "not_found");
    return json(presentLesson(row.lesson_key, row.order, row.lesson, row.result));
  }

  if (!placementDone(ctx.record)) throw new HttpError(409, "Take the short test first.", "no_placement");
  const next = pickNext(ctx.record, ctx.plan, ctx.today);
  if (next.kind === "finished") return json({ finished: true });

  const order = next.order;
  const k = lessonKey(ctx.record, order);
  let row = await loadLesson(k);
  if (!row) {
    let pending = inflight.get(k);
    if (!pending) {
      pending = generate(k, ctx.learnerId, clientIp(req), order).finally(() => inflight.delete(k));
      inflight.set(k, pending);
    }
    row = await pending;
  }
  // The cached content is keyed by unit, mode and review concepts; the why line is always today's.
  return json(presentLesson(row.lesson_key, { ...row.order, why: order.why }, row.lesson, row.result));
});
