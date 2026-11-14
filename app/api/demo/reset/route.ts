import { samplePlan } from "@/lib/course";
import { deleteLessonsOf, savePlan, saveLearner } from "@/lib/db";
import { newRecord, startCourse } from "@/lib/rules";
import { context, json, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Demo control: clears this learner's progress and lessons, keeps their ID, and starts the sample course again. */
export const POST = route(async (req) => {
  const ctx = await context(req);
  const sample = await samplePlan();
  await savePlan(sample.id, sample.plan);
  await deleteLessonsOf(ctx.learnerId);
  await saveLearner(startCourse(newRecord(ctx.learnerId), sample.id, sample.plan));
  return json({ stage: "survey" });
});
