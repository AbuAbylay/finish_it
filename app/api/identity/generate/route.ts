import { samplePlan } from "@/lib/course";
import { savePlan } from "@/lib/db";
import { json, route } from "@/lib/http";
import { createSession, registerLearner } from "@/lib/identity";
import { startCourse } from "@/lib/rules";

export const dynamic = "force-dynamic";

/** One tap: a new learner with a random ID, the sample course attached, and a session. */
export const POST = route(async (req) => {
  const sample = await samplePlan();
  await savePlan(sample.id, sample.plan);
  const { learnerId, loginId } = await registerLearner(req, (record) => startCourse(record, sample.id, sample.plan));
  const res = json({ login_id: loginId, stage: "survey" });
  await createSession(req, res, learnerId);
  return res;
});
