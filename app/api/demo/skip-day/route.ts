import { today } from "@/lib/dates";
import { saveLearner } from "@/lib/db";
import { HttpError, context, json, route } from "@/lib/server";

export const dynamic = "force-dynamic";

const MAX_OFFSET = 365;

/** Demo control: moves the learner's today forward. Body { days } is optional: 1 (default) to 7. */
export const POST = route(async (req) => {
  const ctx = await context(req);
  if (!ctx.record) throw new HttpError(409, "Start with a course first.", "no_course");
  const body = (await req.json().catch(() => ({}))) as { days?: unknown };
  const days = body.days === undefined ? 1 : Number(body.days);
  if (!Number.isInteger(days) || days < 1 || days > 7) throw new HttpError(400, "days must be a whole number from 1 to 7.", "bad_days");
  const demo_day_offset = Math.min(ctx.record.demo_day_offset + days, MAX_OFFSET);
  await saveLearner({ ...ctx.record, demo_day_offset });
  return json({ demo_day_offset, today: today(demo_day_offset, ctx.timeZone) });
});
