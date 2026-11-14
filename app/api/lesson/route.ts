import { writeLesson } from "@/ai";
import { parseLesson } from "@/lib/contracts";
import { latestGradedLesson, loadLesson, saveLesson, type LessonRow } from "@/lib/db";
import { assertLessonOpen, lockedError } from "@/lib/locks";
import { canReread, lessonStateOf, pickNext, placementDone } from "@/lib/rules";
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
  return { lesson_key: key, learner_id: learnerId, order, lesson: parsed.lesson, result: null, answers: {} };
}

/**
 * GET /api/lesson            -> the open lesson (picks the next unit; cached or newly written).
 * GET /api/lesson?unit=u03   -> the open lesson if u03 is open; a read-only view if u03 is done or known;
 *                               403 "locked" otherwise.
 * GET /api/lesson?key=...    -> a lesson this learner already has: graded ones always, ungraded ones only while open.
 */
export const GET = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  if (!placementDone(ctx.record)) throw new HttpError(409, "Take the short test first.", "no_placement");

  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const row = await loadLesson(key);
    if (!row || row.learner_id !== ctx.learnerId) throw new HttpError(404, "Lesson not found.", "not_found");
    if (!row.result) assertLessonOpen(ctx, row);
    return json(presentLesson(row.lesson_key, row.order, row.lesson, row.result, row.answers));
  }

  const unitId = req.nextUrl.searchParams.get("unit");
  if (unitId) {
    const state = lessonStateOf(ctx.record, ctx.plan, ctx.today, unitId);
    if (state === null) throw new HttpError(404, "There is no such unit in your course.", "not_found");
    if (state === "locked") throw lockedError(ctx, unitId);
    if (canReread(state)) {
      const unit = ctx.plan.units.find((u) => u.unit_id === unitId)!;
      const past = await latestGradedLesson(ctx.learnerId, unitId);
      return json({
        reread: true,
        state,
        unit: { unit_id: unit.unit_id, title: unit.title, objective: unit.objective, excerpt: unit.excerpt },
        lesson: past ? presentLesson(past.lesson_key, past.order, past.lesson, past.result, past.answers) : null,
      });
    }
    // state === "next": fall through to the open lesson.
  }

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
  return json(presentLesson(row.lesson_key, { ...row.order, why: order.why }, row.lesson, row.result, row.answers));
});
