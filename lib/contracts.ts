// Runtime guards for everything that crosses a trust boundary: browser input and model output.
// The AI layer validates its own output (SAGYNDYK-AI.md); these checks make sure the app never
// renders or grades something that does not match PROJECT.md §4.
import { z } from "zod";
import { isIsoDate } from "./dates";
import type { CoursePlan, Lesson, Profile, Question } from "./types";

const WEEKDAY_ENUM = z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
const BLOCKER_ENUM = z.enum(["time", "motivation", "difficulty", "forgetting", "other"]);
const text = (max: number) => z.string().trim().max(max);

export const profileSchema = z.object({
  course_title: text(200).min(1),
  goal: text(300),
  success: text(300),
  focus: z.array(text(200)).max(20),
  skip: z.array(text(200)).max(20),
  minutes_per_day: z.number().int().min(5).max(120),
  study_days: z.array(WEEKDAY_ENUM).min(1).max(7),
  deadline: z.string().refine(isIsoDate, "deadline must be a YYYY-MM-DD date"),
  prior_knowledge: text(300),
  blocker: BLOCKER_ENUM,
  blocker_note: text(500),
});

const questionSchema = z.object({
  question_id: z.string().min(1),
  concept: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string()).length(4),
  correct_index: z.number().int().min(0).max(3),
  explanation: z.string(),
  source_quote: z.string(),
});

const lessonSchema = z.object({
  unit_id: z.string().min(1),
  title: z.string().min(1),
  sections: z.array(z.object({ heading: z.string(), body_md: z.string(), source_quote: z.string() })).min(1),
  key_points: z.array(z.string()),
  quiz: z.array(questionSchema).length(3),
  review_quiz: z.array(questionSchema),
});

const coursePlanSchema = z.object({
  title: z.string().min(1),
  units: z
    .array(
      z.object({
        unit_id: z.string().min(1),
        title: z.string().min(1),
        objective: z.string(),
        excerpt: z.string().min(1),
        prerequisites: z.array(z.string()),
      }),
    )
    .min(1),
  placement_test: z.array(questionSchema.extend({ unit_id: z.string().min(1) })).min(1),
});

export const answersSchema = z.record(z.string().max(100), z.number().int().min(-1).max(9));

export function issues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export function parseProfile(input: unknown): { ok: true; profile: Profile } | { ok: false; error: string } {
  const r = profileSchema.safeParse(input);
  if (!r.success) return { ok: false, error: issues(r.error) };
  const days = new Set(r.data.study_days);
  const study_days = WEEKDAY_ENUM.options.filter((d) => days.has(d));
  return { ok: true, profile: { ...r.data, study_days } };
}

/** Question ids must be unique within a lesson, because answers are keyed by them. */
function uniqueIds(questions: Question[], prefix: string): Question[] {
  const seen = new Set<string>();
  return questions.map((q, i) => {
    const id = seen.has(q.question_id) ? `${prefix}${i + 1}` : q.question_id;
    seen.add(id);
    return { ...q, question_id: id };
  });
}

export function parseLesson(input: unknown): { ok: true; lesson: Lesson } | { ok: false; error: string } {
  const r = lessonSchema.safeParse(input);
  if (!r.success) return { ok: false, error: issues(r.error) };
  const quiz = uniqueIds(r.data.quiz, `${r.data.unit_id}-q`);
  const review_quiz = uniqueIds(r.data.review_quiz, `${r.data.unit_id}-r`).map((q) =>
    quiz.some((x) => x.question_id === q.question_id) ? { ...q, question_id: `${q.question_id}-review` } : q,
  );
  return { ok: true, lesson: { ...r.data, quiz, review_quiz } };
}

export function parseCoursePlan(input: unknown): { ok: true; plan: CoursePlan } | { ok: false; error: string } {
  const r = coursePlanSchema.safeParse(input);
  if (!r.success) return { ok: false, error: issues(r.error) };
  const ids = new Set(r.data.units.map((u) => u.unit_id));
  if (ids.size !== r.data.units.length) return { ok: false, error: "unit_id values must be unique" };
  const orphan = r.data.placement_test.find((q) => !ids.has(q.unit_id));
  if (orphan) return { ok: false, error: `placement question ${orphan.question_id} points to unknown unit ${orphan.unit_id}` };
  return { ok: true, plan: r.data };
}
