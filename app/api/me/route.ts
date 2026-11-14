import { stage } from "@/lib/rules";
import { context, json, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Where the learner is in the flow, plus what the survey needs to show. */
export const GET = route(async (req) => {
  const { record, plan, today } = await context(req);
  return json({
    stage: stage(record, plan),
    today,
    demo_day_offset: record?.demo_day_offset ?? 0,
    profile: record?.profile ?? null,
    course: plan ? { title: plan.title, units: plan.units.map((u) => ({ unit_id: u.unit_id, title: u.title })) } : null,
  });
});
