// PROJECT.md §5 as pure functions: grader, next-unit picker, pace, reminders, calendar.
// No I/O and no clock: callers pass `today` (from lib/dates.ts today()).
import {
  addDays,
  countStudyDays,
  isIsoDate,
  isStudyDay,
  nextStudyDay,
  studyDaysStrictlyBetween,
} from "./dates";
import {
  WEEKDAYS,
  type Answers,
  type CoursePlan,
  type LearnerRecord,
  type Lesson,
  type MissedConcept,
  type Mode,
  type Order,
  type Profile,
  type Question,
  type ReviewConcept,
  type Unit,
  type UnitState,
  type UnitStatus,
  type Weekday,
} from "./types";

export const PASS_SCORE = 0.6;
/** Days until the next review after each correct review answer. After the last one the entry is removed. */
export const REVIEW_INTERVALS = [1, 3, 7] as const;
export const MAX_REVIEW_CONCEPTS = 2;
export const CATCH_UP_MAX_MINUTES = 10;

// ---------------------------------------------------------------------------
// Record basics
// ---------------------------------------------------------------------------

export function newRecord(learnerId: string): LearnerRecord {
  return {
    learner_id: learnerId,
    email: null,
    profile: null,
    course_plan_id: null,
    units: {},
    missed_concepts: [],
    sessions: [],
    last_active: null,
    streak: 0,
    demo_day_offset: 0,
  };
}

/** Attach a course plan: every unit starts as `todo`. Progress is cleared. */
export function startCourse(record: LearnerRecord, planId: string, plan: CoursePlan): LearnerRecord {
  const units: Record<string, UnitState> = {};
  for (const u of plan.units) units[u.unit_id] = { status: "todo", score: null, last_seen: null };
  return { ...record, course_plan_id: planId, units, missed_concepts: [], sessions: [], last_active: null, streak: 0 };
}

export function unitStatus(record: LearnerRecord, unitId: string): UnitStatus {
  return record.units[unitId]?.status ?? "todo";
}

function isOpen(status: UnitStatus): boolean {
  return status === "todo" || status === "needs_review";
}

export function openUnits(record: LearnerRecord, plan: CoursePlan): Unit[] {
  return plan.units.filter((u) => isOpen(unitStatus(record, u.unit_id)));
}

function studyDaysOf(profile: Profile | null): readonly Weekday[] {
  return profile && profile.study_days.length > 0 ? profile.study_days : WEEKDAYS;
}

/** The placement test sets last_seen on every unit it asked about, so this is how we know it was taken. */
export function placementDone(record: LearnerRecord): boolean {
  return Object.values(record.units).some((u) => u.last_seen !== null);
}

/** First day the learner did anything on the course (placement or a lesson), or null. */
export function firstActiveDay(record: LearnerRecord): string | null {
  const days = [
    ...Object.values(record.units).flatMap((u) => (u.last_seen ? [u.last_seen] : [])),
    ...record.sessions.map((s) => s.date),
  ];
  return days.length === 0 ? null : days.reduce((a, b) => (a < b ? a : b));
}

export type Stage = "start" | "survey" | "test" | "lesson" | "done";

/** Where a learner belongs in the flow. */
export function stage(record: LearnerRecord | null, plan: CoursePlan | null): Stage {
  if (!record || !record.course_plan_id || !plan) return "start";
  if (!record.profile) return "survey";
  if (!placementDone(record)) return "test";
  if (openUnits(record, plan).length === 0) return "done";
  return "lesson";
}

// ---------------------------------------------------------------------------
// Grader
// ---------------------------------------------------------------------------

export interface QuestionResult {
  question_id: string;
  concept: string;
  chosen: number;
  correct: boolean;
  correct_index: number;
  explanation: string;
  source_quote: string;
}

function gradeQuestion(q: Question, answers: Answers): QuestionResult {
  const chosen = Number.isInteger(answers[q.question_id]) ? answers[q.question_id] : -1;
  return {
    question_id: q.question_id,
    concept: q.concept,
    chosen,
    correct: chosen === q.correct_index,
    correct_index: q.correct_index,
    explanation: q.explanation,
    source_quote: q.source_quote,
  };
}

/** Correct answers / total answers. An empty quiz gives 0: a unit is `done` only on quiz evidence. */
export function scoreOf(results: QuestionResult[]): number {
  if (results.length === 0) return 0;
  return results.filter((r) => r.correct).length / results.length;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function sameConcept(a: { concept: string; unit_id: string }, b: { concept: string; unit_id: string }): boolean {
  return a.unit_id === b.unit_id && norm(a.concept) === norm(b.concept);
}

/** A wrong answer adds the concept, or resets it, with interval_step 0 and review on the next study day. */
export function recordMiss(
  missed: MissedConcept[],
  concept: string,
  unitId: string,
  today: string,
  studyDays: readonly Weekday[],
): MissedConcept[] {
  const review_due = nextStudyDay(today, studyDays);
  const key = { concept, unit_id: unitId };
  const existing = missed.find((m) => sameConcept(m, key));
  if (!existing) {
    return [...missed, { concept, unit_id: unitId, times_missed: 1, interval_step: 0, review_due }];
  }
  return missed.map((m) =>
    m === existing ? { ...m, times_missed: m.times_missed + 1, interval_step: 0, review_due } : m,
  );
}

/**
 * A correct review answer moves the entry along REVIEW_INTERVALS:
 * step 0 -> due in 1 day (step 1) -> due in 3 days (step 2) -> due in 7 days (step 3) -> removed.
 */
export function recordReviewHit(missed: MissedConcept[], target: { concept: string; unit_id: string }, today: string): MissedConcept[] {
  const out: MissedConcept[] = [];
  for (const m of missed) {
    if (!sameConcept(m, target)) {
      out.push(m);
      continue;
    }
    if (m.interval_step >= REVIEW_INTERVALS.length) continue; // past the last interval: drop it
    out.push({ ...m, interval_step: m.interval_step + 1, review_due: addDays(today, REVIEW_INTERVALS[m.interval_step]) });
  }
  return out;
}

/** Streak counts consecutive planned study days with a session. */
export function nextStreak(record: LearnerRecord, today: string): number {
  if (!record.last_active) return 1;
  if (record.last_active >= today) return Math.max(record.streak, 1);
  const missed = studyDaysStrictlyBetween(record.last_active, today, studyDaysOf(record.profile));
  return missed.length === 0 ? record.streak + 1 : 1;
}

/** Streak as shown today: it drops to 0 once a planned study day has passed with no session. */
export function currentStreak(record: LearnerRecord, today: string): number {
  return missedStudyDays(record, today).length > 0 ? 0 : record.streak;
}

/** Planned study days strictly between last_active and today that had no session. */
export function missedStudyDays(record: LearnerRecord, today: string): string[] {
  if (!record.last_active) return [];
  return studyDaysStrictlyBetween(record.last_active, today, studyDaysOf(record.profile));
}

export interface PlacementResult {
  record: LearnerRecord;
  results: (QuestionResult & { unit_id: string })[];
}

/**
 * Short test. A correct answer sets that unit to `known`; every other unit is `todo`.
 * Units the test asked about get last_seen = today (that marks the test as taken).
 * Wrong answers do not create missed_concepts: those units are `todo` and will be taught in full,
 * and reviewing a concept before its unit is taught would crowd out real lesson misses.
 */
export function gradePlacement(record: LearnerRecord, plan: CoursePlan, answers: Answers, today: string): PlacementResult {
  const units: Record<string, UnitState> = {};
  for (const u of plan.units) units[u.unit_id] = { status: "todo", score: null, last_seen: null };

  const results = plan.placement_test.map((q) => ({ ...gradeQuestion(q, answers), unit_id: q.unit_id }));
  for (const r of results) {
    if (!(r.unit_id in units)) continue;
    if (r.correct) units[r.unit_id] = { status: "known", score: 1, last_seen: today };
    else if (units[r.unit_id].status !== "known") units[r.unit_id] = { status: "todo", score: 0, last_seen: today };
  }
  return { record: { ...record, units }, results };
}

export interface LessonResult {
  unit_id: string;
  mode: Mode;
  score: number;
  status: UnitStatus;
  quiz: QuestionResult[];
  review_quiz: QuestionResult[];
  /** Concepts missed in this lesson, with the day they come back. */
  coming_back: { concept: string; review_due: string }[];
}

/** Which review concept a review question belongs to: by concept name, else by position. */
function reviewTarget(lesson: Lesson, order: Order, q: Question, index: number): ReviewConcept | undefined {
  const byName = order.review_concepts.find((rc) => norm(rc.concept) === norm(q.concept));
  if (byName) return byName;
  return lesson.review_quiz.length === order.review_concepts.length ? order.review_concepts[index] : undefined;
}

/**
 * Lesson grading (PROJECT §5): score over `quiz` only; >= 0.6 -> done, else needs_review.
 * review_quiz answers only move review intervals. Appends a session, sets last_active, updates streak.
 */
export function gradeLesson(
  record: LearnerRecord,
  order: Order,
  lesson: Lesson,
  answers: Answers,
  today: string,
): { record: LearnerRecord; result: LessonResult } {
  const studyDays = studyDaysOf(record.profile);
  const quiz = lesson.quiz.map((q) => gradeQuestion(q, answers));
  const review = lesson.review_quiz.map((q) => gradeQuestion(q, answers));
  const score = scoreOf(quiz);
  const status: UnitStatus = score >= PASS_SCORE ? "done" : "needs_review";
  const unitId = order.unit.unit_id;

  let missed = record.missed_concepts;
  lesson.review_quiz.forEach((q, i) => {
    const target = reviewTarget(lesson, order, q, i);
    if (!target) return;
    if (review[i].correct) missed = recordReviewHit(missed, target, today);
    else missed = recordMiss(missed, target.concept, target.unit_id, today, studyDays);
  });
  const coming_back: LessonResult["coming_back"] = [];
  for (const r of quiz) {
    if (r.correct) continue;
    missed = recordMiss(missed, r.concept, unitId, today, studyDays);
    coming_back.push({ concept: r.concept, review_due: nextStudyDay(today, studyDays) });
  }

  const next: LearnerRecord = {
    ...record,
    units: { ...record.units, [unitId]: { status, score, last_seen: today } },
    missed_concepts: missed,
    sessions: [...record.sessions, { date: today, unit_id: unitId, mode: order.mode, score }],
    last_active: today,
    streak: nextStreak(record, today),
  };
  return { record: next, result: { unit_id: unitId, mode: order.mode, score, status, quiz, review_quiz: review, coming_back } };
}

// ---------------------------------------------------------------------------
// Picking the next unit
// ---------------------------------------------------------------------------

export type NextStep = { kind: "finished" } | { kind: "lesson"; order: Order };

const DEFAULT_MINUTES = 15;

export function pickNext(record: LearnerRecord, plan: CoursePlan, today: string): NextStep {
  // Rule 6: nothing left to learn.
  if (openUnits(record, plan).length === 0) return { kind: "finished" };

  const profile = record.profile;
  const byId = new Map(plan.units.map((u) => [u.unit_id, u]));
  const profileMinutes = profile?.minutes_per_day ?? DEFAULT_MINUTES;
  const last = record.sessions.at(-1);
  const lastUnit = last ? byId.get(last.unit_id) : undefined;
  const missedDays = missedStudyDays(record, today);

  let mode: Mode;
  let unit: Unit;
  let minutes = profileMinutes;
  let branchWhy: string;

  if (lastUnit && missedDays.length > 0) {
    // Rule 1: planned study days were missed since last_active.
    mode = "catch_up";
    unit = lastUnit;
    minutes = Math.min(profileMinutes, CATCH_UP_MAX_MINUTES);
    const n = missedDays.length;
    branchWhy = `You missed ${n} planned study day${n === 1 ? "" : "s"}, so today is a ${minutes}-minute catch-up on “${unit.title}”.`;
  } else if (lastUnit && unitStatus(record, lastUnit.unit_id) === "needs_review") {
    // Rule 2: the last unit needs another pass.
    mode = "review";
    unit = lastUnit;
    branchWhy = `You scored ${pct(last?.score ?? 0)} on “${unit.title}” last time, so today teaches it again with a new example.`;
  } else {
    // Rule 3: first unit in plan order still to learn.
    const todo = plan.units.find((u) => unitStatus(record, u.unit_id) === "todo");
    if (todo) {
      mode = "new";
      unit = todo;
      branchWhy = newUnitWhy(record, plan, unit, lastUnit);
    } else {
      // Only needs_review units remain (and the last session was on another unit).
      const pending = plan.units.find((u) => unitStatus(record, u.unit_id) === "needs_review") as Unit;
      mode = "review";
      unit = pending;
      branchWhy = `“${unit.title}” still needs another pass, so today goes over it again.`;
    }
  }

  // Rule 4: up to two concepts that are due.
  const review_concepts: ReviewConcept[] = record.missed_concepts
    .filter((m) => m.review_due <= today && byId.has(m.unit_id))
    .sort((a, b) => a.review_due.localeCompare(b.review_due) || b.times_missed - a.times_missed)
    .slice(0, MAX_REVIEW_CONCEPTS)
    .map((m) => ({ concept: m.concept, unit_id: m.unit_id, excerpt: (byId.get(m.unit_id) as Unit).excerpt }));

  // Rule 5: the why line, from the branch taken and the review concepts.
  const reviewWhy = reviewSentence(record, review_concepts);
  const why = mode === "catch_up" || !reviewWhy ? [branchWhy, reviewWhy].filter(Boolean).join(" ") : `${reviewWhy} ${branchWhy}`;

  return {
    kind: "lesson",
    order: {
      mode,
      minutes,
      unit: { unit_id: unit.unit_id, title: unit.title, objective: unit.objective, excerpt: unit.excerpt },
      learner: {
        goal: profile?.goal ?? "",
        focus: profile?.focus ?? [],
        prior_knowledge: profile?.prior_knowledge ?? "",
      },
      review_concepts,
      why,
    },
  };
}

function pct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

function newUnitWhy(record: LearnerRecord, plan: CoursePlan, unit: Unit, lastUnit: Unit | undefined): string {
  if (lastUnit && unitStatus(record, lastUnit.unit_id) === "done") {
    return `You passed “${lastUnit.title}”, so today moves on to “${unit.title}”.`;
  }
  if (record.sessions.length === 0) {
    const known = plan.units.filter((u) => unitStatus(record, u.unit_id) === "known").length;
    if (known > 0) {
      return `Your short test showed you already know ${known} unit${known === 1 ? "" : "s"}, so you start at “${unit.title}”.`;
    }
    return `You start at the beginning: “${unit.title}”.`;
  }
  return `Next up: “${unit.title}”.`;
}

function reviewSentence(record: LearnerRecord, concepts: ReviewConcept[]): string {
  if (concepts.length === 0) return "";
  const entry = (rc: ReviewConcept) => record.missed_concepts.find((m) => sameConcept(m, rc));
  const missed = concepts.filter((rc) => (entry(rc)?.interval_step ?? 0) === 0).map((rc) => `“${rc.concept}”`);
  const spaced = concepts.filter((rc) => (entry(rc)?.interval_step ?? 0) > 0).map((rc) => `“${rc.concept}”`);
  const parts: string[] = [];
  if (missed.length > 0) {
    parts.push(`You missed ${missed.join(" and ")}, so today's quiz brings ${missed.length === 1 ? "it" : "them"} back.`);
  }
  if (spaced.length > 0) {
    parts.push(`${spaced.join(" and ")} ${spaced.length === 1 ? "is" : "are"} due for a spaced review.`);
  }
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// Pace, reminders, calendar
// ---------------------------------------------------------------------------

export interface Pace {
  lessons_left: number;
  days_left: number;
  on_track: boolean;
  behind_by: number;
  line: string;
}

/**
 * lessons_left = units still `todo` or `needs_review`.
 * days_left = planned study days from today up to (not including) the exam date.
 * Today counts only while today's session is still to do.
 */
export function pace(record: LearnerRecord, plan: CoursePlan, today: string): Pace {
  const lessons_left = openUnits(record, plan).length;
  const deadline = record.profile?.deadline;
  const studiedToday = record.sessions.some((s) => s.date === today);
  const from = studiedToday ? addDays(today, 1) : today;
  const days_left = deadline && isIsoDate(deadline) ? countStudyDays(from, deadline, studyDaysOf(record.profile)) : 0;
  const on_track = lessons_left <= days_left;
  const behind_by = on_track ? 0 : lessons_left - days_left;
  const line =
    lessons_left === 0 ? "Course finished" : on_track ? "On track" : `Behind by ${behind_by} lesson${behind_by === 1 ? "" : "s"}`;
  return { lessons_left, days_left, on_track, behind_by, line };
}

export type ReminderType = "planned_day" | "missed_day";

/**
 * Missed-day: the day after a planned study day with no session (once the learner has started).
 * Planned-day: a study day with no session yet. Missed-day wins when both apply.
 */
export function reminderToday(record: LearnerRecord, today: string): ReminderType | null {
  if (!record.profile) return null;
  const studyDays = studyDaysOf(record.profile);
  const studied = (d: string) => record.sessions.some((s) => s.date === d);
  const yesterday = addDays(today, -1);
  const started = firstActiveDay(record);
  if (started && started <= yesterday && isStudyDay(yesterday, studyDays) && !studied(yesterday)) return "missed_day";
  if (isStudyDay(today, studyDays) && !studied(today)) return "planned_day";
  return null;
}

export type DayStatus = "done" | "missed" | "planned" | "rest";

export interface CalendarDay {
  date: string;
  status: DayStatus;
  sessions: number;
  is_today: boolean;
  is_deadline: boolean;
}

/** Calendar cells for from..to inclusive. */
export function calendar(record: LearnerRecord, today: string, from: string, to: string): CalendarDay[] {
  const studyDays = studyDaysOf(record.profile);
  const started = firstActiveDay(record) ?? today;
  const deadline = record.profile?.deadline ?? null;
  const days: CalendarDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const sessions = record.sessions.filter((s) => s.date === d).length;
    const study = isStudyDay(d, studyDays) && (deadline === null || d < deadline);
    let status: DayStatus;
    if (sessions > 0) status = "done";
    else if (d < today) status = study && d >= started ? "missed" : "rest";
    else status = study ? "planned" : "rest";
    days.push({ date: d, status, sessions, is_today: d === today, is_deadline: d === deadline });
  }
  return days;
}
