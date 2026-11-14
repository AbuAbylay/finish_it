// Response shapes of the API routes, for the pages. Type-only imports: nothing server-side reaches the browser bundle.
import type { AiImplementation } from "./ai-info";
import type {
  CalendarDay,
  LessonListItem,
  LessonResult,
  LessonState,
  Pace,
  QuestionResult,
  ReminderType,
  SessionOption,
  SessionPlan,
  Stage,
} from "./rules";
import type { PresentedLesson, PublicQuestion } from "./server";
import type { Mode, Profile, Weekday } from "./types";
import type { planView, reminderView } from "./views";

export type {
  CalendarDay,
  LessonListItem,
  LessonResult,
  LessonState,
  Pace,
  PresentedLesson,
  PublicQuestion,
  QuestionResult,
  ReminderType,
  SessionOption,
  SessionPlan,
  Stage,
};

/** GET /api/me (401 { code: "signed_out" } when there is no session) */
export interface MeResponse {
  stage: Stage;
  today: string;
  demo_day_offset: number;
  /** The learner's own ID, for the sidebar. Display only. */
  login_id: string | null;
  /** Opaque per-learner key for drafts and stable option shuffles. */
  client_key: string;
  ai: AiImplementation;
  /** "real" when sample/course-plan.json is the learner's course (show its credit line), "dev" for the dev fixture, null for their own course. */
  sample: "real" | "dev" | null;
  profile: Profile | null;
  course: { title: string; units: { unit_id: string; title: string }[] } | null;
}

/** POST /api/identity/generate */
export interface GenerateResponse {
  login_id: string;
  stage: Stage;
}

/** POST /api/identity/enter { login_id }. Errors: 400 bad_id, 404 unknown_id, 429 rate_limited. */
export interface EnterResponse {
  stage: Stage;
}

/** GET /api/lesson?unit=X for a done, known or needs_review unit: read-only. */
export interface RereadResponse {
  reread: true;
  state: LessonState;
  unit: { unit_id: string; title: string; objective: string; excerpt: string };
  /** The last graded lesson on this unit, with its result, or null (for example a unit known from the short test). */
  lesson: PresentedLesson | null;
}

/**
 * GET /api/session, and POST /api/session { minutes } to store today's session length (limited to 10 to 30;
 * the first choice of a day stands). Errors: 400 bad_minutes, 409 no_placement.
 */
export interface SessionResponse extends SessionPlan {
  today: string;
  /** True at the start of a day's session: nothing chosen, nothing studied today, no lesson in progress. Show the time chooser. */
  ask: boolean;
  /** The unit the next lesson is on, or null when the course is finished. */
  open_unit_id: string | null;
}

/**
 * GET /api/lesson[?unit=X | ?key=K | ?minutes=NN]. PresentedLesson.checked holds feedback for questions already answered.
 * ?minutes stores today's session length first, like POST /api/session.
 * Errors: 403 { code: "locked" } for a locked unit, 409 { code: "stale" } for an old lesson that is no longer open,
 * 429 rate_limited, 502 ai_error (retry).
 */
export type LessonResponse = PresentedLesson | RereadResponse | { finished: true };

/** POST /api/answers/check { lesson_key, question_id, choice } (choice is the original option index). */
export interface CheckResponse {
  feedback: QuestionResult;
  already_answered: boolean;
}

/** POST /api/answers { lesson_key } after all questions are checked */
export interface AnswersResponse {
  result: LessonResult;
  already_graded: boolean;
  stage: Stage;
  pace: Pace;
}

/** GET /api/lessons */
export interface LessonsResponse {
  today: string;
  demo_day_offset: number;
  course_title: string;
  items: LessonListItem[];
  next: { unit_id: string; unit_title: string; mode: Mode; minutes: number; why: string } | null;
}

/** GET /api/calendar?month=YYYY-MM */
export interface CalendarResponse {
  month: string;
  today: string;
  demo_day_offset: number;
  deadline: string | null;
  study_days: Weekday[];
  days: (CalendarDay & { in_month: boolean })[];
  pace: Pace;
}

/** POST /api/demo/skip-day { days?: 1..7 } */
export interface SkipResponse {
  demo_day_offset: number;
  today: string;
}

/** POST /api/placement */
export interface PlacementResponse {
  results: (QuestionResult & { unit_id: string; unit_title: string })[];
  known: string[];
  lessons_left: number;
}

/** GET /api/plan (also used by Home): pace, stats, units, calendar, reviews coming up, next step. */
export type PlanResponse = ReturnType<typeof planView>;
/** GET /api/reminder-preview */
export type ReminderResponse = Awaited<ReturnType<typeof reminderView>>;
