import { answersSchema, issues } from "@/lib/contracts";
import { loadLesson, saveLearner, saveLessonResult } from "@/lib/db";
import { assertLessonOpen } from "@/lib/locks";
import { gradeLesson, pace, stage } from "@/lib/rules";
import { HttpError, context, json, readJson, requireSetUp, route } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Grades the open lesson (PROJECT §5), updates the record and returns the result with the answers revealed.
 * Answers already checked one at a time win over any sent in the body.
 */
export const POST = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  const body = (await readJson(req)) as { lesson_key?: unknown; answers?: unknown };
  if (typeof body.lesson_key !== "string") throw new HttpError(400, "lesson_key is required.", "bad_request");
  const sent = answersSchema.safeParse(body.answers ?? {});
  if (!sent.success) throw new HttpError(400, `Invalid answers: ${issues(sent.error)}`, "bad_answers");

  const row = await loadLesson(body.lesson_key);
  if (!row || row.learner_id !== ctx.learnerId) throw new HttpError(404, "Lesson not found.", "not_found");
  const current = () => ({ stage: stage(ctx.record, ctx.plan), pace: pace(ctx.record, ctx.plan, ctx.today) });
  if (row.result) return json({ result: row.result, already_graded: true, ...current() });
  assertLessonOpen(ctx, row);

  const answers = { ...sent.data, ...row.answers };
  const { record, result } = gradeLesson(ctx.record, row.order, row.lesson, answers, ctx.today);
  if (!(await saveLessonResult(row.lesson_key, result))) {
    const graded = await loadLesson(row.lesson_key);
    return json({ result: graded?.result ?? result, already_graded: true, ...current() });
  }
  await saveLearner(record);
  return json({ result, already_graded: false, stage: stage(record, ctx.plan), pace: pace(record, ctx.plan, ctx.today) });
});
