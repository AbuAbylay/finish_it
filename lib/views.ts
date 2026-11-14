// Read models for the plan page and the reminder preview, built from the record with the §5 rules.
import "server-only";
import { copy } from "./content";
import { addDays, weekdayOf } from "./dates";
import { renderReminder, type Email } from "./reminders";
import {
  CATCH_UP_MAX_MINUTES,
  calendar,
  currentStreak,
  pace,
  pickNext,
  reminderToday,
  type Pace,
  type ReminderType,
} from "./rules";
import { WEEKDAYS, type CoursePlan, type LearnerRecord, type Profile } from "./types";

/** The pace sentence as shown on the plan page (wording in lib/content.ts). */
function paceText(p: Pace): string {
  if (p.lessons_left === 0) return copy.pace.finished;
  const spare = p.days_left - p.lessons_left;
  if (p.on_track && spare > 0) return copy.pace.onTrackSpare(p.lessons_left, p.days_left, spare);
  if (p.on_track) return copy.pace.onTrackExact;
  return copy.pace.behind(p.behind_by, p.lessons_left, p.days_left);
}

type SetUp = { record: LearnerRecord & { profile: Profile }; plan: CoursePlan; today: string };

export function planView({ record, plan, today }: SetUp) {
  const next = pickNext(record, plan, today);
  // Five calendar weeks starting on the Monday two weeks before this week.
  const monday = addDays(today, -WEEKDAYS.indexOf(weekdayOf(today)));
  const from = addDays(monday, -14);
  return {
    today,
    demo_day_offset: record.demo_day_offset,
    course_title: record.profile.course_title || plan.title,
    deadline: record.profile.deadline,
    minutes_per_day: record.profile.minutes_per_day,
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

export async function reminderView({ record, plan, today }: SetUp, link: string) {
  const next = pickNext(record, plan, today);
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
  const minutes: Record<ReminderType, number> = {
    planned_day: record.profile.minutes_per_day,
    missed_day: Math.min(record.profile.minutes_per_day, CATCH_UP_MAX_MINUTES),
  };
  const emails = {} as Record<ReminderType, Email>;
  for (const type of ["planned_day", "missed_day"] as const) {
    emails[type] = await renderReminder(type, record.profile.blocker, { ...base, minutes: minutes[type] });
  }
  return { today, today_type: reminderToday(record, today), blocker: record.profile.blocker, emails };
}
