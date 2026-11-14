import { z } from "zod";
import { issues } from "@/lib/contracts";
import { loadLesson, recordAnswer } from "@/lib/db";
import { assertLessonOpen } from "@/lib/locks";
import { checkAnswer } from "@/lib/rules";
import { HttpError, context, json, readJson, requireSetUp, route } from "@/lib/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  lesson_key: z.string().min(1).max(100),
  question_id: z.string().min(1).max(100),
  choice: z.number().int().min(-1).max(9),
});

/**
 * Checks one answer. The first answer to a question is locked in, so seeing the correct option
 * cannot be used to change it. The answer key is revealed only for the question just answered.
 */
export const POST = route(async (req) => {
  const ctx = requireSetUp(await context(req));
  const body = bodySchema.safeParse(await readJson(req));
  if (!body.success) throw new HttpError(400, issues(body.error), "bad_request");
  const { lesson_key, question_id, choice } = body.data;

  const row = await loadLesson(lesson_key);
  if (!row || row.learner_id !== ctx.learnerId) throw new HttpError(404, "Lesson not found.", "not_found");
  const q = [...row.lesson.quiz, ...row.lesson.review_quiz].find((x) => x.question_id === question_id);
  if (!q) throw new HttpError(404, "Question not found.", "not_found");
  if (row.result) {
    const graded = [...row.result.quiz, ...row.result.review_quiz].find((r) => r.question_id === question_id);
    return json({ feedback: graded, already_answered: true });
  }
  assertLessonOpen(ctx, row);
  if (choice >= q.options.length) throw new HttpError(400, "That option does not exist.", "bad_request");

  if (question_id in row.answers) return json({ feedback: checkAnswer(q, row.answers[question_id]), already_answered: true });
  if (!(await recordAnswer(lesson_key, question_id, choice))) {
    const fresh = await loadLesson(lesson_key);
    if (fresh && question_id in fresh.answers) {
      return json({ feedback: checkAnswer(q, fresh.answers[question_id]), already_answered: true });
    }
    throw new HttpError(409, "This lesson changed while you were answering. Please reload it.", "conflict");
  }
  return json({ feedback: checkAnswer(q, choice), already_answered: false });
});
