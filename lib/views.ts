// Read models for the plan page and the reminder preview, built from the record with the §5 rules.
import "server-only";
import { copy } from "./content";
import { addDays, weekdayOf } from "./dates";
import { renderReminder, type Email } from "./reminders";
import {
  CATCH_UP_MAX_MINUTES,
  calendar,
  currentStreak,
  lessonMinutes,
  pace,
  pickNext,
  reminderToday,
  sessionLength,
  sessionPlan,
  type Pace,
  type ReminderType,
} from "./rules";
import { WEEKDAYS, type CoursePlan, type LearnerRecord, type Profile } from "./types";

/** The pace sentence as shown on the plan page (wording in lib/content.ts). */
function paceText(p: Pace): string {
  if (p.lessons_left === 0) return copy.pace.finished;
  if (p.on_track && p.spare_days > 0) return copy.pace.onTrackSpare(p.lessons_left, p.days_left, p.spare_days);
  if (p.on_track) return copy.pace.onTrackExact;
  return copy.pace.behind(p.behind_by, p.lessons_left, p.days_left);
}

type SetUp = { record: LearnerRecord & { profile: Profile }; plan: CoursePlan; today: string; minutesToday?: number | null };

export function planView({ record, plan, today, minutesToday = null }: SetUp) {
  const next = pickNext(record, plan, today, minutesToday);
  // Five calendar weeks starting on the Monday two weeks before this week.
  const monday = addDays(today, -WEEKDAYS.indexOf(weekdayOf(today)));
  const from = addDays(monday, -14);
  return {
    today,
    demo_day_offset: record.demo_day_offset,
    course_title: record.profile.course_title || plan.title,
    deadline: record.profile.deadline,
    minutes_per_day: record.profile.minutes_per_day,
    /** Length of one lesson at the learner's usual session length (a session of 25 minutes or more holds two). */
    lesson_minutes: lessonMinutes(sessionLength(record)),
    session: sessionPlan(record, today, minutesToday),
    pace: pace(record, plan, today),
    streak: currentStreak(record, today),
    sessions_done: record.sessions.length,
    units_done: plan.units.filter((u) => ["done", "known"].includes(record.units[u.unit_id]?.status ?? "todo")).length,
    units_total: plan.units.length,
    reviews: [...record.missed_concepts]
      .sort((a, b) => a.review_due.localeCompare(b.review_due))
      .map((m) => ({
        concept: m.concept,
        unit_id: m.unit_id,
        unit_title: plan.units.find((u) => u.unit_id === m.unit_id)?.title ?? m.unit_id,
        review_due: m.review_due,
        due_now: m.review_due <= today,
        times_missed: m.times_missed,
        interval_step: m.interval_step,
      })),
    studied_today: record.sessions.some((s) => s.date === today),
    units: plan.units.map((u) => ({
      unit_id: u.unit_id,
      title: u.title,
      status: record.units[u.unit_id]?.status ?? "todo",
      score: record.units[u.unit_id]?.score ?? null,
    })),
    calendar: calendar(record, today, from, addDays(from, 34)),
    next:
      next.kind === "finished"
        ? null
        : { mode: next.order.mode, minutes: next.order.minutes, unit_title: next.order.unit.title, why: next.order.why },
    reminder_today: reminderToday(record, today),
  };
}

export async function reminderView({ record, plan, today, minutesToday = null }: SetUp, link: string) {
  const next = pickNext(record, plan, today, minutesToday);
  const p = pace(record, plan, today);
  const unitTitle = next.kind === "lesson" ? next.order.unit.title : plan.title;
  const base = {
    course_title: record.profile.course_title || plan.title,
    unit_title: unitTitle,
    lessons_left: p.lessons_left,
    days_left: p.days_left,
    pace: paceText(p),
    goal: record.profile.goal,
    link,
  };
  // Planned day: the whole session. Missed day: the catch-up lesson, never longer than 10 minutes.
  const minutes: Record<ReminderType, number> = {
    planned_day: sessionLength(record, minutesToday),
    missed_day: Math.min(lessonMinutes(sessionLength(record)), CATCH_UP_MAX_MINUTES),
  };
  const emails = {} as Record<ReminderType, Email>;
  for (const type of ["planned_day", "missed_day"] as const) {
    emails[type] = await renderReminder(type, record.profile.blocker, { ...base, minutes: minutes[type] });
  }
  // No email goes out once the course is finished or today's lesson is done; otherwise the rule decides,
  // and a day with neither a planned nor a missed session is a rest day.
  const studiedToday = record.sessions.some((s) => s.date === today);
  const due = next.kind === "finished" || studiedToday ? null : reminderToday(record, today);
  const none_reason: "finished" | "studied" | "rest" | null =
    due !== null ? null : next.kind === "finished" ? "finished" : studiedToday ? "studied" : "rest";
  return { today, today_type: due, none_reason, blocker: record.profile.blocker, emails };
}
