// Server-side enforcement of locked lessons (PROJECT §5 picker + lessonStates in lib/rules.ts).
import "server-only";
import type { LessonRow } from "./db";
import { HttpError } from "./http";
import { lessonStateOf, pickNext } from "./rules";
import type { CoursePlan, LearnerRecord } from "./types";

type SetUp = { record: LearnerRecord; plan: CoursePlan; today: string };

function openTitle(ctx: SetUp): string | null {
  const next = pickNext(ctx.record, ctx.plan, ctx.today);
  return next.kind === "lesson" ? next.order.unit.title : null;
}

/** Throws 403 "locked" for a unit that is not open yet. */
export function lockedError(ctx: SetUp, unitId: string): HttpError {
  const title = ctx.plan.units.find((u) => u.unit_id === unitId)?.title ?? unitId;
  const open = openTitle(ctx);
  return new HttpError(403, open ? `“${title}” unlocks after you pass “${open}”.` : `“${title}” is locked.`, "locked");
}

/**
 * A cached lesson can be answered or graded only while its unit is the open one.
 * Locked units get 403; an old lesson for a unit that is no longer open gets 409 "stale".
 */
export function assertLessonOpen(ctx: SetUp, row: LessonRow): void {
  const unitId = row.order.unit.unit_id;
  const state = lessonStateOf(ctx.record, ctx.plan, ctx.today, unitId);
  if (state === "next") return;
  if (state === "locked" || state === null) throw lockedError(ctx, unitId);
  throw new HttpError(409, "This lesson is no longer the open one. Today's lesson is ready instead.", "stale");
}
