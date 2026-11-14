import { today } from "@/lib/dates";
import { saveLearner } from "@/lib/db";
import { HttpError, context, json, route } from "@/lib/server";

export const dynamic = "force-dynamic";

const MAX_OFFSET = 365;

/** Demo control: moves the learner's today forward by one day. */
export const POST = route(async (req) => {
  const ctx = await context(req);
  if (!ctx.record) throw new HttpError(409, "Start with a course first.", "no_course");
  if (ctx.record.demo_day_offset >= MAX_OFFSET) throw new HttpError(409, "The demo clock is already a year ahead.", "offset_limit");
  const demo_day_offset = ctx.record.demo_day_offset + 1;
  await saveLearner({ ...ctx.record, demo_day_offset });
  return json({ demo_day_offset, today: today(demo_day_offset, ctx.timeZone) });
});
