import { addDays, weekdayOf } from "@/lib/dates";
import { calendar, pace } from "@/lib/rules";
import { HttpError, context, json, requireSetUp, route } from "@/lib/server";
import { WEEKDAYS } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Month grid for the calendar popover: GET /api/calendar?month=YYYY-MM (default: the learner's current month). */
export const GET = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  const month = req.nextUrl.searchParams.get("month") ?? ctx.today.slice(0, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, "month must be YYYY-MM.", "bad_month");

  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const last = addDays(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`, -1);
  const from = addDays(first, -WEEKDAYS.indexOf(weekdayOf(first)));
  const to = addDays(last, 6 - WEEKDAYS.indexOf(weekdayOf(last)));

  return json({
    month,
    today: ctx.today,
    demo_day_offset: ctx.record.demo_day_offset,
    deadline: ctx.record.profile?.deadline ?? null,
    study_days: ctx.record.profile?.study_days ?? [],
    days: calendar(ctx.record, ctx.today, from, to).map((d) => ({ ...d, in_month: d.date.startsWith(month) })),
    pace: pace(ctx.record, ctx.plan, ctx.today),
  });
});
