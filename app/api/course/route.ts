import { setupCourse } from "@/ai";
import { parseCoursePlan } from "@/lib/contracts";
import { uploadCopy } from "@/lib/copy/pages";
import { contentId, samplePlan } from "@/lib/course";
import { savePlan, saveLearner } from "@/lib/db";
import { newRecord, startCourse } from "@/lib/rules";
import { HttpError, assertUnderCaps, clientIp, context, json, readJson, recordGeneration, route } from "@/lib/server";
import { isAiError, type CoursePlan } from "@/lib/types";
import { UPLOAD_MAX_CHARS, UPLOAD_MIN_CHARS } from "@/lib/upload";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Topic titles for the page that shows the learner what their plan was built into. */
const topics = (plan: CoursePlan) => plan.units.map((u) => ({ unit_id: u.unit_id, title: u.title }));

/**
 * { source: "sample" } loads the saved sample plan.
 * { source: "upload", text } calls setupCourse on the learner's own material (lib/upload.ts has the size limits).
 * The survey comes after this call, so setupCourse usually runs with no profile.
 * A learner who already has lessons keeps their course; "start over" in the browser makes a new guest.
 * Errors for an upload: 400 too_short, 413 too_long, 429 rate_limited, 502 ai_error (retry).
 */
export const POST = route(async (req) => {
  const ctx = await context(req);
  const body = (await readJson(req)) as { source?: unknown; text?: unknown };
  const record = ctx.record ?? newRecord(ctx.learnerId);

  if (record.course_plan_id && record.sessions.length > 0) {
    return json({ course_plan_id: record.course_plan_id, title: ctx.plan?.title ?? "", units: ctx.plan ? topics(ctx.plan) : [], kept: true });
  }

  let id: string;
  let plan: CoursePlan;
  if (body.source === "sample") {
    const sample = await samplePlan();
    await savePlan(sample.id, sample.plan);
    id = sample.id;
    plan = sample.plan;
    await saveLearner(startCourse(record, id, plan));
  } else if (body.source === "upload") {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < UPLOAD_MIN_CHARS) throw new HttpError(400, uploadCopy.tooShort, "too_short");
    if (text.length > UPLOAD_MAX_CHARS) throw new HttpError(413, uploadCopy.tooLong, "too_long");
    await assertUnderCaps(ctx.learnerId, clientIp(req));
    const result = await setupCourse(text, record.profile);
    const parsed = isAiError(result) ? null : parseCoursePlan(result);
    await recordGeneration(ctx.learnerId, clientIp(req), "setup", !!parsed?.ok);
    if (isAiError(result)) {
      console.error("setupCourse failed:", result.error, result.detail ?? "");
      throw new HttpError(502, result.error, "ai_error");
    }
    if (!parsed?.ok) {
      console.error("course plan contract mismatch:", parsed?.error);
      throw new HttpError(502, "The course plan came back in an unexpected shape. Please try again.", "ai_error");
    }
    plan = parsed.plan;
    id = contentId("upload", JSON.stringify(plan));
    await savePlan(id, plan);
    await saveLearner(startCourse(record, id, plan));
  } else {
    throw new HttpError(400, 'source must be "sample" or "upload".', "bad_source");
  }
  return json({ course_plan_id: id, title: plan.title, units: topics(plan), kept: false });
});
