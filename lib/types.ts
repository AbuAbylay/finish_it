// Data contracts from PROJECT.md §4. Field names are fixed: change them in PROJECT.md first.

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: readonly Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export type Blocker = "time" | "motivation" | "difficulty" | "forgetting" | "other";
export const BLOCKERS: readonly Blocker[] = ["time", "motivation", "difficulty", "forgetting", "other"];

/** §4.1, saved from the survey form. */
export interface Profile {
  course_title: string;
  goal: string;
  success: string;
  focus: string[];
  skip: string[];
  minutes_per_day: number;
  study_days: Weekday[];
  /** Exam date, YYYY-MM-DD. */
  deadline: string;
  prior_knowledge: string;
  blocker: Blocker;
  blocker_note: string;
}

/** §4.2 */
export interface Unit {
  unit_id: string;
  title: string;
  objective: string;
  excerpt: string;
  prerequisites: string[];
}

/** Shared by placement questions, lesson quiz and review quiz. */
export interface Question {
  question_id: string;
  concept: string;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string;
  source_quote: string;
}

export interface PlacementQuestion extends Question {
  unit_id: string;
}

export interface CoursePlan {
  title: string;
  units: Unit[];
  placement_test: PlacementQuestion[];
}

export type Mode = "new" | "review" | "catch_up";

/**
 * How hard a lesson pushes, set by code from the learner's recent results (lib/rules.ts levelFor):
 * "support" for a unit taught again, "stretch" after two strong lessons in a row, "standard" otherwise.
 */
export type Level = "support" | "standard" | "stretch";

export interface ReviewConcept {
  concept: string;
  unit_id: string;
  excerpt: string;
}

/**
 * Why this learner studies, in the shape of the teach skill's MISSION.md: the reason, what success
 * looks like, the constraints, and what is out of scope. Built from the survey.
 */
export interface Mission {
  course: string;
  why: string;
  success: string;
  focus: string[];
  out_of_scope: string[];
  minutes_per_day: number;
  /** Calendar days from today to the exam; null without a valid exam date. */
  days_to_exam: number | null;
  obstacle: Blocker;
}

/**
 * Where the learner stands, in the spirit of the teach skill's learning records: evidence, not coverage.
 * `demonstrated` are topics passed in a lesson quiz, `claimed` are topics marked as known in the short
 * check or skipped in the survey, `misconceptions` are ideas answered wrongly and not yet cleared.
 */
export interface LearningDigest {
  starting_point: string;
  demonstrated: { topic: string; score: number }[];
  claimed: string[];
  misconceptions: { concept: string; topic: string; times_missed: number }[];
}

/** §4.3, built by code and sent to the lesson call. */
export interface Order {
  mode: Mode;
  minutes: number;
  unit: Pick<Unit, "unit_id" | "title" | "objective" | "excerpt">;
  learner: Pick<Profile, "goal" | "focus" | "prior_knowledge">;
  review_concepts: ReviewConcept[];
  why: string;
  /** Absent in orders written before levels existed. The AI layer then uses "support" for a review and "standard" otherwise. */
  level?: Level;
  /** Absent in older orders. The AI layer then builds a thinner mission from `learner`. */
  mission?: Mission;
  /** Absent in older orders. */
  learned?: LearningDigest;
}

/** §4.4 */
export interface LessonSection {
  heading: string;
  body_md: string;
  source_quote: string;
}

export interface Lesson {
  unit_id: string;
  title: string;
  sections: LessonSection[];
  key_points: string[];
  quiz: Question[];
  review_quiz: Question[];
}

/** §4.5 */
export type UnitStatus = "todo" | "known" | "done" | "needs_review";

export interface UnitState {
  status: UnitStatus;
  score: number | null;
  last_seen: string | null;
}

export interface MissedConcept {
  concept: string;
  unit_id: string;
  times_missed: number;
  interval_step: number;
  review_due: string;
}

export interface Session {
  date: string;
  unit_id: string;
  mode: Mode;
  score: number;
}

export interface LearnerRecord {
  learner_id: string;
  email: string | null;
  profile: Profile | null;
  course_plan_id: string | null;
  units: Record<string, UnitState>;
  missed_concepts: MissedConcept[];
  sessions: Session[];
  last_active: string | null;
  streak: number;
  demo_day_offset: number;
}

/** What the AI layer returns after its one retry fails. The app shows a retry button. */
export interface AiError {
  error: string;
  detail?: string;
}

export function isAiError(value: unknown): value is AiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error: unknown }).error === "string"
  );
}

/** One turn of the side chat. */
export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** What the validators return. */
export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

/** A learner's answers: question_id -> chosen option index in the original (unshuffled) order. -1 means "don't know". */
export type Answers = Record<string, number>;
