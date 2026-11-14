// Response shapes of the API routes, for the pages. Type-only imports: nothing server-side reaches the browser bundle.
import type { CalendarDay, LessonResult, Pace, QuestionResult, ReminderType, Stage } from "./rules";
import type { PresentedLesson, PublicQuestion } from "./server";
import type { Profile } from "./types";
import type { planView, reminderView } from "./views";

export type { CalendarDay, LessonResult, Pace, PresentedLesson, PublicQuestion, QuestionResult, ReminderType, Stage };

export interface MeResponse {
  stage: Stage;
  today: string;
  demo_day_offset: number;
  profile: Profile | null;
  course: { title: string; units: { unit_id: string; title: string }[] } | null;
}

export type LessonResponse = PresentedLesson | { finished: true };
export type PlanResponse = ReturnType<typeof planView>;
export type ReminderResponse = Awaited<ReturnType<typeof reminderView>>;

export interface AnswersResponse {
  result: LessonResult;
  already_graded: boolean;
  stage: Stage;
  pace: Pace;
}

export interface PlacementResponse {
  results: (QuestionResult & { unit_id: string; unit_title: string })[];
  known: string[];
  lessons_left: number;
}
