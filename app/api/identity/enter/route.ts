import { loadLearner, loadPlan } from "@/lib/db";
import { json, readJson, route } from "@/lib/http";
import { createSession, findLearnerByLoginId } from "@/lib/identity";
import { stage } from "@/lib/rules";

export const dynamic = "force-dynamic";

/** A returning learner types their ID and continues where they left off. */
export const POST = route(async (req) => {
  const body = (await readJson(req)) as { login_id?: unknown };
  const learnerId = await findLearnerByLoginId(req, body.login_id);
  const record = await loadLearner(learnerId);
  const plan = record?.course_plan_id ? await loadPlan(record.course_plan_id) : null;
  const res = json({ stage: stage(record, plan) });
  await createSession(req, res, learnerId);
  return res;
});
