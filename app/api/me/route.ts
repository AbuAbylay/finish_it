import { aiImplementation } from "@/lib/ai-info";
import { samplePlan } from "@/lib/course";
import { displayId } from "@/lib/identity";
import { stage } from "@/lib/rules";
import { clientKey, context, json, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Where the learner is in the flow, plus what the shell and the survey need. 401 when signed out. */
export const GET = route(async (req) => {
  const { learnerId, record, plan, today } = await context(req);
  const sample = await samplePlan();
  return json({
    stage: stage(record, plan),
    today,
    demo_day_offset: record?.demo_day_offset ?? 0,
    login_id: await displayId(learnerId),
    client_key: clientKey(learnerId),
    ai: aiImplementation(),
    // An ID that started on an earlier version of the sample keeps that plan; it is still the sample, not an upload.
    sample: record?.course_plan_id === sample.id ? sample.source : record?.course_plan_id?.startsWith("sample-") ? "dev" : null,
    profile: record?.profile ?? null,
    course: plan ? { title: plan.title, source: plan.source ?? null, units: plan.units.map((u) => ({ unit_id: u.unit_id, title: u.title })) } : null,
  });
});
