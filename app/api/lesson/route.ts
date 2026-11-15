import { writeLesson } from "@/ai";
import { parseLesson } from "@/lib/contracts";
import { chooseSessionMinutes, latestGradedLesson, loadLesson, saveLesson, type LessonRow } from "@/lib/db";
import { assertLessonOpen, lockedError } from "@/lib/locks";
import { canReread, lessonStateOf, parseMinutes, pickNext, placementDone, sessionLength } from "@/lib/rules";
import {
  HttpError,
  assertUnderCaps,
  clientIp,
  context,
  findLesson,
  json,
  lessonKey,
  presentLesson,
  recordGeneration,
  requireSetUp,
  route,
} from "@/lib/server";
import { isAiError, type Order } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Requests for the same lesson that arrive together share one model call (per server instance).
const inflight = new Map<string, Promise<LessonRow>>();

async function generate(key: string, learnerId: string, ip: string, order: Order): Promise<LessonRow> {
  await assertUnderCaps(learnerId, ip);
  const out = await writeLesson(order);
  if (isAiError(out)) {
    console.error("writeLesson failed:", out.error, out.detail ?? "");
    await recordGeneration(learnerId, ip, "lesson", false);
    throw new HttpError(502, out.error || "The lesson could not be written. Please try again.", "ai_error");
  }
  const parsed = parseLesson(out);
  if (!parsed.ok) {
    console.error("lesson contract mismatch:", parsed.error);
    await recordGeneration(learnerId, ip, "lesson", false);
    throw new HttpError(502, "The lesson came back in an unexpected shape. Please try again.", "ai_error");
  }
  await recordGeneration(learnerId, ip, "lesson", true);
  await saveLesson(key, learnerId, order, parsed.lesson);
  // Another server instance may have stored this lesson first (the insert keeps the first one).
  // Always return the stored row, so the questions shown are the ones answers are graded against.
  const stored = await loadLesson(key);
  return stored ?? { lesson_key: key, learner_id: learnerId, order, lesson: parsed.lesson, result: null, answers: {} };
}

/**
 * GET /api/lesson            -> the open lesson (picks the next unit; cached or newly written), sized to today's
 *                               session: the learner's choice for today, else the minutes from their profile.
 * GET /api/lesson?minutes=20 -> the same, after storing 20 as today's choice (like POST /api/session).
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
    return json(presentLesson(row.lesson_key, row.order, row.lesson, row.result, row.answers, ctx.plan.source));
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
        lesson: past ? presentLesson(past.lesson_key, past.order, past.lesson, past.result, past.answers, ctx.plan.source) : null,
      });
    }
    // state === "next": fall through to the open lesson.
  }

  // The first choice of a day stands, so asking again with another value cannot trigger a second lesson.
  let minutesToday = ctx.minutesToday;
  const asked = req.nextUrl.searchParams.get("minutes");
  if (asked !== null) {
    const minutes = parseMinutes(asked);
    if (minutes === null) throw new HttpError(400, "minutes must be a whole number.", "bad_minutes");
    if (minutesToday === null) minutesToday = await chooseSessionMinutes(ctx.learnerId, ctx.today, minutes);
  }

  const next = pickNext(ctx.record, ctx.plan, ctx.today, minutesToday);
  if (next.kind === "finished") return json({ finished: true });

  const order = next.order;
  // A lesson in progress for this unit is resumed, whatever length it was written for.
  let row = await findLesson(ctx.record, order);
  if (!row) {
    // The lesson about to be written fixes today's session length, so a later choice cannot replace it.
    if (minutesToday === null) await chooseSessionMinutes(ctx.learnerId, ctx.today, sessionLength(ctx.record));
    const k = lessonKey(ctx.record, order);
    let pending = inflight.get(k);
    if (!pending) {
      pending = generate(k, ctx.learnerId, clientIp(req), order).finally(() => inflight.delete(k));
      inflight.set(k, pending);
    }
    row = await pending;
  }
  // The cached content is keyed by unit, mode and review concepts; the why line is always today's.
  return json(presentLesson(row.lesson_key, { ...row.order, why: order.why }, row.lesson, row.result, row.answers, ctx.plan.source));
});
