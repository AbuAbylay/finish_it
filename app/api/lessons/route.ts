import { latestGradedLesson } from "@/lib/db";
import { estimateMinutes, lessonStates, pickNext, placementDone } from "@/lib/rules";
import { HttpError, context, findLesson, json, requireSetUp, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Every unit in plan order with its state (done, known, needs_review, next, locked). Pages never recompute the rules. */
export const GET = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  if (!placementDone(ctx.record)) throw new HttpError(409, "Take the short test first.", "no_placement");
  const next = pickNext(ctx.record, ctx.plan, ctx.today, ctx.minutesToday);
  // A lesson that is already written shows the time estimated from the lesson itself: the last one studied
  // on a unit, or the open one once it exists. A lesson not written yet shows the usual lesson length.
  const items = await Promise.all(
    lessonStates(ctx.record, ctx.plan, ctx.today, ctx.minutesToday).map(async (item) => {
      const written =
        item.state === "next" && next.kind === "lesson"
          ? await findLesson(ctx.record, next.order)
          : item.date_kind === "studied"
            ? await latestGradedLesson(ctx.record.learner_id, item.unit_id)
            : null;
      return written ? { ...item, minutes: estimateMinutes(written.lesson) } : item;
    }),
  );
  return json({
    today: ctx.today,
    demo_day_offset: ctx.record.demo_day_offset,
    course_title: ctx.record.profile?.course_title || ctx.plan.title,
    items,
    next:
      next.kind === "lesson"
        ? { unit_id: next.order.unit.unit_id, unit_title: next.order.unit.title, mode: next.order.mode, minutes: next.order.minutes, why: next.order.why }
        : null,
  });
});
