import { setupCourse } from "@/ai";
import { parseCoursePlan } from "@/lib/contracts";
import { contentId, samplePlan } from "@/lib/course";
import { savePlan, saveLearner } from "@/lib/db";
import { newRecord, startCourse } from "@/lib/rules";
import { HttpError, clientIp, context, json, readJson, route, spendGeneration } from "@/lib/server";
import { isAiError } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_UPLOAD_CHARS = 200_000;

/**
 * { source: "sample" } loads the saved sample plan.
 * { source: "upload", text } calls setupCourse on the learner's own material.
 * A learner who already has lessons keeps their course; "start over" in the browser makes a new guest.
 */
export const POST = route(async (req) => {
  const ctx = await context(req);
  const body = (await readJson(req)) as { source?: unknown; text?: unknown };
  const record = ctx.record ?? newRecord(ctx.learnerId);

  if (record.course_plan_id && record.sessions.length > 0) {
    return json({ course_plan_id: record.course_plan_id, title: ctx.plan?.title ?? "", kept: true });
  }

  let id: string;
  let title: string;
  if (body.source === "sample") {
    const sample = await samplePlan();
    await savePlan(sample.id, sample.plan);
    id = sample.id;
    title = sample.plan.title;
    await saveLearner(startCourse(record, id, sample.plan));
  } else if (body.source === "upload") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 500) throw new HttpError(400, "Paste at least a few paragraphs of your course.", "too_short");
    if (text.length > MAX_UPLOAD_CHARS) throw new HttpError(413, "That is more text than we can handle in one go.", "too_long");
    await spendGeneration(ctx.learnerId, clientIp(req), "setup");
    const result = await setupCourse(text, record.profile);
    if (isAiError(result)) throw new HttpError(502, result.error, "ai_error");
    const parsed = parseCoursePlan(result);
    if (!parsed.ok) throw new HttpError(502, "The course plan came back in an unexpected shape. Please try again.", "ai_error");
    id = contentId("upload", JSON.stringify(parsed.plan));
    title = parsed.plan.title;
    await savePlan(id, parsed.plan);
    await saveLearner(startCourse(record, id, parsed.plan));
  } else {
    throw new HttpError(400, 'source must be "sample" or "upload".', "bad_source");
  }
  return json({ course_plan_id: id, title, kept: false });
});
