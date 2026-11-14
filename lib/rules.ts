// PROJECT.md §5 as pure functions: grader, next-unit picker, pace, reminders, calendar.
// No I/O and no clock: callers pass `today` (from lib/dates.ts today()).
import {
  addDays,
  countStudyDays,
  isIsoDate,
  isStudyDay,
  nextStudyDay,
  shortDate,
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

/** Feedback for one answered question (used when questions are checked one at a time). */
export function checkAnswer(q: Question, chosen: number): QuestionResult {
  return gradeQuestion(q, { [q.question_id]: chosen });
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
 * Units the learner chose to skip in the survey (profile.skip, by unit title) are `known` too.
 * Units the test asked about get last_seen = today (that marks the test as taken).
 * Wrong answers do not create missed_concepts: those units are `todo` and will be taught in full,
 * and reviewing a concept before its unit is taught would crowd out real lesson misses.
 */
export function gradePlacement(record: LearnerRecord, plan: CoursePlan, answers: Answers, today: string): PlacementResult {
  const skipped = new Set((record.profile?.skip ?? []).map(norm));
  const units: Record<string, UnitState> = {};
  for (const u of plan.units) {
    units[u.unit_id] = skipped.has(norm(u.title))
      ? { status: "known", score: null, last_seen: today }
      : { status: "todo", score: null, last_seen: null };
  }

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

  if (lastUnit && missedDays.length > 0) {
    // Rule 1: planned study days were missed since last_active.
    mode = "catch_up";
    unit = lastUnit;
    minutes = Math.min(profileMinutes, CATCH_UP_MAX_MINUTES);
  } else if (lastUnit && unitStatus(record, lastUnit.unit_id) === "needs_review") {
    // Rule 2: the last unit needs another pass.
    mode = "review";
    unit = lastUnit;
  } else {
    // Rule 3: first unit in plan order still to learn; a pending review comes first if no todo is left.
    const todo = plan.units.find((u) => unitStatus(record, u.unit_id) === "todo");
    mode = todo ? "new" : "review";
    unit = todo ?? (plan.units.find((u) => unitStatus(record, u.unit_id) === "needs_review") as Unit);
  }

  // Rule 4: up to two concepts that are due.
  const review_concepts: ReviewConcept[] = record.missed_concepts
    .filter((m) => m.review_due <= today && byId.has(m.unit_id))
    .sort((a, b) => a.review_due.localeCompare(b.review_due) || b.times_missed - a.times_missed)
    .slice(0, MAX_REVIEW_CONCEPTS)
    .map((m) => ({ concept: m.concept, unit_id: m.unit_id, excerpt: (byId.get(m.unit_id) as Unit).excerpt }));

  // Rule 5: the why line, from the branch taken and the review concepts.
  const why = whyLine({ record, plan, today, mode, unit, minutes, review_concepts, missedDays: missedDays.length, lastScore: last?.score ?? 0 });

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

/** Quiz length from PROJECT §4.4, used to turn a stored score back into "x of 3". */
const QUIZ_LENGTH = 3;

const quoted = (concepts: ReviewConcept[]) => concepts.map((c) => `“${c.concept}”`).join(" and ");

/**
 * Why lines, from COPY.md. **bold** marks the unit title; the page renders it.
 * "You missed ... last time" is used only for concepts missed in the latest attempt (interval_step 0);
 * concepts on a spaced review get a neutral line so the sentence stays true.
 */
function whyLine(a: {
  record: LearnerRecord;
  plan: CoursePlan;
  today: string;
  mode: Mode;
  unit: Unit;
  minutes: number;
  review_concepts: ReviewConcept[];
  missedDays: number;
  lastScore: number;
}): string {
  const title = `**${a.unit.title}**`;
  const step = (rc: ReviewConcept) => a.record.missed_concepts.find((m) => sameConcept(m, rc))?.interval_step ?? 0;
  const reviews = a.review_concepts;
  const allFresh = reviews.length > 0 && reviews.every((rc) => step(rc) === 0);
  const startsWithReview = reviews.length === 0 ? "" : ` It starts with a quick review of ${quoted(reviews)}.`;

  if (a.mode === "catch_up") {
    const n = a.missedDays;
    return `You missed ${n} planned day${n === 1 ? "" : "s"}. Here's a shorter ${a.minutes}-minute recap of ${title} to get you back in.${startsWithReview}`;
  }
  if (a.mode === "review") {
    const last = a.record.sessions.at(-1);
    if (last && last.unit_id === a.unit.unit_id) {
      const correct = Math.round(a.lastScore * QUIZ_LENGTH);
      return `Last time you got ${correct} of ${QUIZ_LENGTH} on ${title}. Today goes over it again in a different way.${startsWithReview}`;
    }
    return `${title} still needs another pass. Today goes over it again in a different way.${startsWithReview}`;
  }
  // mode "new"
  if (a.record.sessions.length === 0) return `Today starts your plan: ${title}.`;
  if (reviews.length === 0) {
    const p = pace(a.record, a.plan, a.today);
    const deadline = a.record.profile?.deadline;
    return p.on_track && deadline ? `Next up: ${title}. You're on track for ${shortDate(deadline)}.` : `Next up: ${title}.`;
  }
  if (allFresh && reviews.length === 1) {
    return `You missed “${reviews[0].concept}” last time, so today starts with a quick review, then ${title}.`;
  }
  if (allFresh) return `You missed ${quoted(reviews)} earlier, so today starts with a quick review, then ${title}.`;
  return `Today starts with a quick review of ${quoted(reviews)}, so it sticks, then ${title}.`;
}

// ---------------------------------------------------------------------------
// Locked lessons
// ---------------------------------------------------------------------------

/**
 * Lesson states for the lessons page and for server-side locking.
 * - next: the one unit pickNext returns. Only it can be studied and graded.
 * - done / known: open for re-reading; re-reading never changes the record.
 * - needs_review: failed earlier and not the current lesson (re-readable).
 * - locked: everything else, until the open lesson is passed.
 */
export type LessonState = "done" | "known" | "needs_review" | "next" | "locked";

export interface LessonListItem {
  unit_id: string;
  title: string;
  objective: string;
  state: LessonState;
  /** Set for the open lesson only. */
  mode: Mode | null;
  minutes: number;
  /** studied: last session on the unit; tested: short test or skip; planned: projected study day. */
  date: string | null;
  date_kind: "studied" | "tested" | "planned" | null;
  score: number | null;
}

export function lessonStates(record: LearnerRecord, plan: CoursePlan, today: string): LessonListItem[] {
  const next = pickNext(record, plan, today);
  const open = next.kind === "lesson" ? next.order : null;
  const studyDays = studyDaysOf(record.profile);
  const minutes = record.profile?.minutes_per_day ?? DEFAULT_MINUTES;
  const studiedToday = record.sessions.some((s) => s.date === today);
  let planned = studiedToday ? nextStudyDay(today, studyDays) : today;

  return plan.units.map((u) => {
    const unitState = record.units[u.unit_id];
    const status = unitState?.status ?? "todo";
    const lastSession = record.sessions.filter((s) => s.unit_id === u.unit_id).at(-1);
    const base = { unit_id: u.unit_id, title: u.title, objective: u.objective, score: unitState?.score ?? null };

    if (open && open.unit.unit_id === u.unit_id) {
      const item: LessonListItem = { ...base, state: "next", mode: open.mode, minutes: open.minutes, date: planned, date_kind: "planned" };
      planned = nextStudyDay(planned, studyDays);
      return item;
    }
    if (status === "todo") {
      const item: LessonListItem = { ...base, state: "locked", mode: null, minutes, date: open ? planned : null, date_kind: open ? "planned" : null };
      if (open) planned = nextStudyDay(planned, studyDays);
      return item;
    }
    const state: LessonState = status === "known" ? "known" : status === "done" ? "done" : "needs_review";
    const date = lastSession?.date ?? unitState?.last_seen ?? null;
    const date_kind = lastSession ? "studied" : date ? "tested" : null;
    return { ...base, state, mode: null, minutes, date, date_kind };
  });
}

export function lessonStateOf(record: LearnerRecord, plan: CoursePlan, today: string, unitId: string): LessonState | null {
  return lessonStates(record, plan, today).find((i) => i.unit_id === unitId)?.state ?? null;
}

/** Re-reading is allowed for units already covered; it never changes the record. */
export function canReread(state: LessonState | null): boolean {
  return state === "done" || state === "known" || state === "needs_review";
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
