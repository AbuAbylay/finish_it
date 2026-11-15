import { describe, expect, it } from "vitest";
import { addDays, countStudyDays, nextStudyDay, studyDaysStrictlyBetween, today, weekdayOf } from "@/lib/dates";
import {
  calendar,
  canReread,
  clampMinutes,
  lessonMinutes,
  learnedOf,
  lessonStates,
  lessonsInSession,
  levelFor,
  missionOf,
  currentStreak,
  gradeLesson,
  gradePlacement,
  newRecord,
  pace,
  parseMinutes,
  pickNext,
  recordMiss,
  recordReviewHit,
  reminderToday,
  sessionLength,
  sessionPlan,
  stage,
  startCourse,
  type NextStep,
} from "@/lib/rules";
import type { CoursePlan, LearnerRecord, Lesson, Order, Profile, Question, Weekday } from "@/lib/types";

// 2026-11-16 is a Monday.
const MON = "2026-11-16";
const TUE = "2026-11-17";
const WED = "2026-11-18";
const THU = "2026-11-19";
const ALL_DAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const q = (id: string, concept: string, correct = 0): Question => ({
  question_id: id,
  concept,
  prompt: `Question ${id}`,
  options: ["a", "b", "c", "d"],
  correct_index: correct,
  explanation: "because",
  source_quote: "quote",
});

const plan: CoursePlan = {
  title: "Test course",
  units: ["u01", "u02", "u03", "u04"].map((id) => ({
    unit_id: id,
    title: `Unit ${id}`,
    objective: `Do ${id}`,
    excerpt: `Excerpt for ${id}.`,
    prerequisites: [],
  })),
  placement_test: [
    { ...q("p01", "c1"), unit_id: "u01" },
    { ...q("p02", "c2"), unit_id: "u02" },
    { ...q("p03", "c3"), unit_id: "u03" },
  ],
};

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  course_title: "Test course",
  goal: "Get promoted",
  success: "Pass",
  focus: [],
  skip: [],
  minutes_per_day: 15,
  study_days: ALL_DAYS,
  deadline: "2026-12-31",
  prior_knowledge: "None",
  blocker: "time",
  blocker_note: "",
  ...overrides,
});

/** A learner who took the short test on `day` and got only u01 right. */
function placed(day = MON, p: Profile = profile()): LearnerRecord {
  const r = { ...startCourse(newRecord("l1"), "test", plan), profile: p };
  return gradePlacement(r, plan, { p01: 0, p02: 1, p03: 1 }, day).record;
}

function lessonFor(order: Order): Lesson {
  return {
    unit_id: order.unit.unit_id,
    title: order.unit.title,
    sections: [{ heading: "h", body_md: "b", source_quote: "s" }],
    key_points: ["k"],
    quiz: [q("q1", "alpha"), q("q2", "beta"), q("q3", "gamma")],
    review_quiz: order.review_concepts.map((rc, i) => q(`r${i}`, rc.concept)),
  };
}

function orderOf(step: NextStep): Order {
  if (step.kind !== "lesson") throw new Error("expected a lesson");
  return step.order;
}

/** Pick the next lesson on `day` and answer it: `wrong` lists quiz question ids answered wrong; review questions in `wrongReview`. */
function study(record: LearnerRecord, day: string, wrong: string[] = [], wrongReview: string[] = []) {
  const order = orderOf(pickNext(record, plan, day));
  const lesson = lessonFor(order);
  const answers: Record<string, number> = {};
  for (const qq of [...lesson.quiz, ...lesson.review_quiz]) {
    answers[qq.question_id] = wrong.includes(qq.question_id) || wrongReview.includes(qq.question_id) ? 1 : 0;
  }
  return { order, lesson, ...gradeLesson(record, order, lesson, answers, day) };
}

describe("dates", () => {
  it("adds days and reads weekdays", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays(MON, -1)).toBe("2026-11-15");
    expect(weekdayOf(MON)).toBe("mon");
    expect(weekdayOf("2026-11-15")).toBe("sun");
  });

  it("today() adds demo_day_offset to the date in the learner's time zone", () => {
    const now = new Date("2026-11-15T20:30:00Z");
    expect(today(0, "UTC", now)).toBe("2026-11-15");
    expect(today(0, "Asia/Almaty", now)).toBe("2026-11-16");
    expect(today(2, "America/New_York", now)).toBe("2026-11-17");
    expect(today(0, "Not/AZone", now)).toBe("2026-11-15");
  });

  it("finds study days", () => {
    expect(nextStudyDay(MON, ["mon", "thu"])).toBe(THU);
    expect(studyDaysStrictlyBetween(MON, THU, ALL_DAYS)).toEqual([TUE, WED]);
    expect(countStudyDays(MON, THU, ALL_DAYS)).toBe(3);
  });
});

describe("grader: short test", () => {
  it("sets correct units to known and every other unit to todo", () => {
    const r = placed();
    expect(r.units.u01).toEqual({ status: "known", score: 1, last_seen: MON });
    expect(r.units.u02).toEqual({ status: "todo", score: 0, last_seen: MON });
    expect(r.units.u04).toEqual({ status: "todo", score: null, last_seen: null });
    expect(r.sessions).toEqual([]);
    expect(r.missed_concepts).toEqual([]);
  });

  it("treats a missing answer as wrong", () => {
    const r = { ...startCourse(newRecord("l1"), "test", plan), profile: profile() };
    const { results } = gradePlacement(r, plan, {}, MON);
    expect(results.every((x) => !x.correct && x.chosen === -1)).toBe(true);
  });
});

describe("grader: lessons", () => {
  it("score >= 0.6 marks the unit done; quiz misses are scheduled for the next study day", () => {
    const { record, result } = study(placed(), MON, ["q2"]);
    expect(result.score).toBeCloseTo(2 / 3);
    expect(record.units.u02.status).toBe("done");
    expect(record.missed_concepts).toEqual([
      { concept: "beta", unit_id: "u02", times_missed: 1, interval_step: 0, review_due: TUE },
    ]);
    expect(record.sessions).toEqual([{ date: MON, unit_id: "u02", mode: "new", score: 2 / 3 }]);
    expect(record.last_active).toBe(MON);
    expect(record.streak).toBe(1);
  });

  it("score below 0.6 marks the unit needs_review", () => {
    const { record, result } = study(placed(), MON, ["q1", "q2"]);
    expect(result.status).toBe("needs_review");
    expect(record.units.u02.status).toBe("needs_review");
  });

  it("review_quiz answers do not change the score", () => {
    const r = study(placed(), MON, ["q1"]).record;
    const { result } = study(r, TUE, [], ["r0"]);
    expect(result.review_quiz).toHaveLength(1);
    expect(result.review_quiz[0].correct).toBe(false);
    expect(result.score).toBe(1);
  });

  it("schedules the next review on the next planned study day, skipping rest days", () => {
    const p = profile({ study_days: ["mon", "thu"] });
    const { record } = study(placed(MON, p), MON, ["q3"]);
    expect(record.missed_concepts[0].review_due).toBe(THU);
  });

  it("a repeat miss resets the entry and counts it", () => {
    const once = recordMiss([], "x", "u01", MON, ALL_DAYS);
    const twice = recordMiss(recordReviewHit(once, { concept: "x", unit_id: "u01" }, TUE), "X ", "u01", WED, ALL_DAYS);
    expect(twice).toEqual([{ concept: "x", unit_id: "u01", times_missed: 2, interval_step: 0, review_due: THU }]);
  });
});

describe("review intervals [1, 3, 7]", () => {
  it("each correct review moves to the next interval, then the entry is removed", () => {
    const t = { concept: "x", unit_id: "u01" };
    let m = recordMiss([], "x", "u01", MON, ALL_DAYS);
    expect(m[0]).toMatchObject({ interval_step: 0, review_due: TUE });

    m = recordReviewHit(m, t, TUE);
    expect(m[0]).toMatchObject({ interval_step: 1, review_due: addDays(TUE, 1) });
    m = recordReviewHit(m, t, WED);
    expect(m[0]).toMatchObject({ interval_step: 2, review_due: addDays(WED, 3) });
    m = recordReviewHit(m, t, "2026-11-21");
    expect(m[0]).toMatchObject({ interval_step: 3, review_due: "2026-11-28" });
    m = recordReviewHit(m, t, "2026-11-28");
    expect(m).toEqual([]);
  });

  it("a wrong review answer resets interval_step to 0", () => {
    let r = study(placed(), MON, ["q2"]).record; // "beta" due TUE
    r = study(r, TUE).record; // reviewed correctly -> step 1, due WED
    expect(r.missed_concepts[0]).toMatchObject({ concept: "beta", interval_step: 1, review_due: WED });
    r = study(r, WED, [], ["r0"]).record; // reviewed wrong -> reset
    expect(r.missed_concepts[0]).toMatchObject({ concept: "beta", interval_step: 0, review_due: THU, times_missed: 2 });
  });

  it("matches review answers by position when the model renames the concept", () => {
    const r = study(placed(), MON, ["q2"]).record;
    const order = orderOf(pickNext(r, plan, TUE));
    const lesson = lessonFor(order);
    lesson.review_quiz[0].concept = "Beta (renamed)";
    const answers = { q1: 0, q2: 0, q3: 0, r0: 0 };
    expect(gradeLesson(r, order, lesson, answers, TUE).record.missed_concepts[0].interval_step).toBe(1);
  });
});

describe("picker", () => {
  it("first lesson: rule 3, first todo unit, explains the short test", () => {
    const order = orderOf(pickNext(placed(), plan, MON));
    expect(order).toMatchObject({ mode: "new", minutes: 15, review_concepts: [] });
    expect(order.unit.unit_id).toBe("u02");
    expect(order.why).toBe("Today starts your plan: **Unit u02**.");
    expect(order.learner.goal).toBe("Get promoted");
  });

  it("new: after a pass, moves to the next todo unit", () => {
    const r = study(placed(), MON).record;
    const order = orderOf(pickNext(r, plan, MON));
    expect(order.mode).toBe("new");
    expect(order.unit.unit_id).toBe("u03");
    expect(order.why).toBe("Next up: **Unit u03**. You're on track for Thu 31 Dec.");
  });

  it("review: the last unit is needs_review, same unit again", () => {
    const r = study(placed(), MON, ["q1", "q2", "q3"]).record;
    const order = orderOf(pickNext(r, plan, TUE));
    expect(order.mode).toBe("review");
    expect(order.unit.unit_id).toBe("u02");
    expect(order.why).toBe("Last time you got none of the questions right on **Unit u02**. Today goes over it again in a different way. It starts with a quick review of “alpha” and “beta”.");
  });

  it("catch_up: a planned study day was missed, last unit, at most 10 minutes", () => {
    const r = study(placed(), MON).record;
    const order = orderOf(pickNext(r, plan, WED));
    expect(order.mode).toBe("catch_up");
    expect(order.minutes).toBe(10);
    expect(order.unit.unit_id).toBe("u02");
    expect(order.why).toBe("You missed 1 planned day. Here's a shorter 10-minute recap of **Unit u02** to get you back in.");
  });

  it("no catch_up when only rest days passed", () => {
    const p = profile({ study_days: ["mon", "thu"] });
    const r = study(placed(MON, p), MON).record;
    expect(orderOf(pickNext(r, plan, THU)).mode).toBe("new");
  });

  it("catch_up is 10 minutes whatever the session length, because no session is shorter than 10", () => {
    for (const minutes_per_day of [5, 10, 20, 30]) {
      const r = study(placed(MON, profile({ minutes_per_day })), MON).record;
      expect(orderOf(pickNext(r, plan, WED)).minutes).toBe(10);
    }
    const r = study(placed(), MON).record;
    expect(orderOf(pickNext(r, plan, WED, 25)).minutes).toBe(10);
  });

  it("a review item coming due is added to review_concepts and named in the why line", () => {
    const r = study(placed(), MON, ["q2"]).record;
    expect(orderOf(pickNext(r, plan, MON)).review_concepts).toEqual([]); // not due yet today
    const order = orderOf(pickNext(r, plan, TUE));
    expect(order.review_concepts).toEqual([{ concept: "beta", unit_id: "u02", excerpt: "Excerpt for u02." }]);
    expect(order.why).toBe("You missed “beta” last time, so today starts with a quick review, then **Unit u03**.");
  });

  it("adds at most two due concepts: earliest due first, then most missed", () => {
    const entry = (concept: string, review_due: string, times_missed = 1) => ({ concept, unit_id: "u01", times_missed, interval_step: 0, review_due });
    const r = {
      ...study(placed(), MON).record,
      missed_concepts: [entry("late", TUE), entry("early", MON), entry("often", TUE, 3), entry("future", WED)],
    };
    expect(orderOf(pickNext(r, plan, TUE)).review_concepts.map((c) => c.concept)).toEqual(["early", "often"]);
  });

  it("spaced reviews are worded differently from fresh misses", () => {
    let r = study(placed(), MON, ["q2"]).record;
    r = study(r, TUE).record; // beta -> step 1, due WED
    expect(orderOf(pickNext(r, plan, WED)).why).toBe("Today starts with a quick review of “beta”, so it sticks, then **Unit u04**.");
  });

  it("falls back to an earlier needs_review unit when no todo unit is left", () => {
    let r = placed();
    r = { ...r, units: { u01: r.units.u01, u02: { status: "needs_review", score: 0, last_seen: MON }, u03: { status: "done", score: 1, last_seen: MON }, u04: { status: "done", score: 1, last_seen: TUE } } };
    r = { ...r, sessions: [{ date: TUE, unit_id: "u04", mode: "new", score: 1 }], last_active: TUE };
    const order = orderOf(pickNext(r, plan, TUE));
    expect(order).toMatchObject({ mode: "review", unit: { unit_id: "u02" } });
  });

  it("finish state: no todo or needs_review unit left", () => {
    let r = placed();
    for (const day of [MON, TUE, WED]) r = study(r, day).record;
    expect(pickNext(r, plan, THU)).toEqual({ kind: "finished" });
    expect(stage(r, plan)).toBe("done");
  });
});

describe("session length", () => {
  it("a session is limited to 10 to 30 whole minutes", () => {
    expect([5, 10, 12.4, 17, 30, 45, 120].map(clampMinutes)).toEqual([10, 10, 12, 17, 30, 30, 30]);
    expect(clampMinutes(Number.NaN)).toBe(15);
  });

  it("holds two lessons from 25 minutes, one below", () => {
    expect([10, 15, 20, 24, 25, 30, 60].map(lessonsInSession)).toEqual([1, 1, 1, 1, 2, 2, 2]);
  });

  it("a lesson takes the whole session, or half of it when the session holds two", () => {
    expect([10, 15, 20, 25, 30].map(lessonMinutes)).toEqual([10, 15, 20, 12, 15]);
    expect(lessonMinutes(5)).toBe(10); // clamped first
    expect(lessonMinutes(90)).toBe(15);
  });

  it("today's choice wins over the profile; without either it is 15 minutes", () => {
    const r = placed(MON, profile({ minutes_per_day: 20 }));
    expect(sessionLength(r)).toBe(20);
    expect(sessionLength(r, 10)).toBe(10);
    expect(sessionLength(r, 45)).toBe(30);
    expect(sessionLength(newRecord("l0"))).toBe(15);
  });

  it("the order carries the length of one lesson of today's session", () => {
    const r = placed(MON, profile({ minutes_per_day: 20 }));
    expect(orderOf(pickNext(r, plan, MON)).minutes).toBe(20); // profile
    expect(orderOf(pickNext(r, plan, MON, 10)).minutes).toBe(10); // today's choice
    expect(orderOf(pickNext(r, plan, MON, 30)).minutes).toBe(15); // two lessons of 15
    expect(orderOf(pickNext(r, plan, MON, 25)).minutes).toBe(12);
    // Stored values outside 10 to 30 are clamped at use.
    expect(orderOf(pickNext(placed(MON, profile({ minutes_per_day: 5 })), plan, MON)).minutes).toBe(10);
    expect(orderOf(pickNext(placed(MON, profile({ minutes_per_day: 120 })), plan, MON)).minutes).toBe(15);
  });

  it("the choice changes the length only: unit, mode and why line stay the same", () => {
    const r = study(placed(), MON, ["q2"]).record;
    const { minutes: a, ...usual } = orderOf(pickNext(r, plan, TUE));
    const { minutes: b, ...chosen } = orderOf(pickNext(r, plan, TUE, 30));
    expect(chosen).toEqual(usual);
    expect([a, b]).toEqual([15, 15]);
    expect(orderOf(pickNext(r, plan, TUE, 10)).minutes).toBe(10);
  });

  it("sessionPlan describes today's session for the chooser", () => {
    const r = placed(MON, profile({ minutes_per_day: 20 }));
    expect(sessionPlan(r, MON)).toMatchObject({ chosen: null, default_minutes: 20, minutes: 20, lessons_in_session: 1, lesson_minutes: 20, lessons_done_today: 0 });
    expect(sessionPlan(r, MON).options).toEqual([
      { minutes: 10, lessons: 1, lesson_minutes: 10 },
      { minutes: 15, lessons: 1, lesson_minutes: 15 },
      { minutes: 20, lessons: 1, lesson_minutes: 20 },
      { minutes: 25, lessons: 2, lesson_minutes: 12 },
      { minutes: 30, lessons: 2, lesson_minutes: 15 },
    ]);
    const studied = study(r, MON).record;
    expect(sessionPlan(studied, MON, 30)).toMatchObject({ chosen: 30, default_minutes: 20, minutes: 30, lessons_in_session: 2, lesson_minutes: 15, lessons_done_today: 1 });
    expect(sessionPlan(studied, TUE, 30).lessons_done_today).toBe(0);
  });

  it("reads a session length sent by the browser", () => {
    expect([parseMinutes(15), parseMinutes("20"), parseMinutes(45), parseMinutes(" 5 ")]).toEqual([15, 20, 30, 10]);
    expect([parseMinutes("abc"), parseMinutes(12.5), parseMinutes(-10), parseMinutes(null), parseMinutes(""), parseMinutes(0)]).toEqual([null, null, null, null, null, null]);
  });
});

describe("stage", () => {
  it("walks start -> survey -> test -> lesson", () => {
    expect(stage(null, null)).toBe("start");
    const started = startCourse(newRecord("l1"), "test", plan);
    expect(stage(started, plan)).toBe("survey");
    expect(stage({ ...started, profile: profile() }, plan)).toBe("test");
    expect(stage(placed(), plan)).toBe("lesson");
  });
});

describe("streak", () => {
  it("grows on consecutive study days and resets after a missed one", () => {
    let r = study(placed(), MON).record;
    r = study(r, TUE).record;
    expect(r.streak).toBe(2);
    expect(currentStreak(r, WED)).toBe(2);
    expect(currentStreak(r, THU)).toBe(0);
    r = study(r, THU).record;
    expect(r.streak).toBe(1);
  });

  it("does not grow twice on the same day", () => {
    let r = study(placed(), MON).record;
    r = study(r, MON).record;
    expect(r.streak).toBe(1);
  });
});

describe("pace", () => {
  it("is on track while lessons_left <= days_left, then flips to behind by N", () => {
    const r = placed(MON, profile({ deadline: "2026-11-21" })); // study days MON..FRI before SAT exam = 5
    expect(pace(r, plan, MON)).toMatchObject({ lessons_left: 3, days_left: 5, on_track: true, line: "On track" });
    expect(pace(r, plan, THU)).toMatchObject({ days_left: 2, on_track: false, behind_by: 1, line: "Behind by 1 lesson" });
    expect(pace(r, plan, "2026-11-21")).toMatchObject({ days_left: 0, line: "Behind by 3 lessons" });
  });

  it("does not count today once today's session is done", () => {
    const r = study(placed(MON, profile({ deadline: "2026-11-21" })), MON).record;
    expect(pace(r, plan, MON)).toMatchObject({ lessons_left: 2, days_left: 4 });
  });

  it("reports a finished course", () => {
    let r = placed();
    for (const day of [MON, TUE, WED]) r = study(r, day).record;
    expect(pace(r, plan, THU).line).toBe("Course finished");
  });

  it("spare days are the study days left over after every lesson has a day", () => {
    const r = placed(MON, profile({ deadline: "2026-11-21" })); // 3 lessons, 5 study days
    expect(pace(r, plan, MON)).toMatchObject({ lessons_per_day: 1, spare_days: 2 });
    expect(pace(r, plan, THU)).toMatchObject({ spare_days: -1, on_track: false });
  });

  it("a session of 25 minutes or more fits two lessons into each study day", () => {
    const short = placed(MON, profile({ deadline: "2026-11-21", minutes_per_day: 20 }));
    const long = placed(MON, profile({ deadline: "2026-11-21", minutes_per_day: 30 }));
    // Friday: 3 lessons left and 1 study day before the exam.
    expect(pace(short, plan, "2026-11-20")).toMatchObject({ days_left: 1, lessons_per_day: 1, on_track: false, behind_by: 2, line: "Behind by 2 lessons" });
    expect(pace(long, plan, "2026-11-20")).toMatchObject({ days_left: 1, lessons_per_day: 2, on_track: false, behind_by: 1, line: "Behind by 1 lesson" });
    // Thursday: 2 study days hold 4 lessons, so 3 lessons are on track, with no day to spare.
    expect(pace(long, plan, THU)).toMatchObject({ days_left: 2, on_track: true, behind_by: 0, spare_days: 0, line: "On track" });
    expect(pace(long, plan, MON)).toMatchObject({ days_left: 5, spare_days: 3 });
  });

  it("a catch-up day does not count as room for a new topic, before or after the catch-up", () => {
    // Studied Monday, missed Tuesday and Wednesday. Thursday's lesson is a recap, so the 2 lessons left
    // have only Friday before the Saturday exam.
    const r = study(placed(MON, profile({ deadline: "2026-11-21" })), MON).record;
    expect(orderOf(pickNext(r, plan, THU)).mode).toBe("catch_up");
    const before = pace(r, plan, THU);
    expect(before).toMatchObject({ lessons_left: 2, days_left: 1, on_track: false, behind_by: 1, line: "Behind by 1 lesson" });
    const after = pace(study(r, THU).record, plan, THU);
    expect(after).toMatchObject({ lessons_left: 2, days_left: 1, behind_by: 1, line: "Behind by 1 lesson" });
  });

  it("after the first of today's two lessons, today still counts for the second", () => {
    // Thursday, exam on Saturday: two study days of two lessons each for the 3 lessons left.
    const start = placed(MON, profile({ deadline: "2026-11-21", minutes_per_day: 30 }));
    expect(pace(start, plan, THU)).toMatchObject({ lessons_left: 3, days_left: 2, on_track: true, spare_days: 0 });
    const one = study(start, THU).record;
    expect(pace(one, plan, THU)).toMatchObject({ lessons_left: 2, days_left: 2, on_track: true, spare_days: 0, line: "On track" });
    const two = study(one, THU).record;
    expect(pace(two, plan, THU)).toMatchObject({ lessons_left: 1, days_left: 1, on_track: true, spare_days: 0 });

    // Friday, the last study day: 3 lessons do not fit into 2, and each lesson done brings the gap down by one.
    expect(pace(start, plan, "2026-11-20")).toMatchObject({ behind_by: 1, spare_days: -1 });
    const friday = study(start, "2026-11-20").record;
    expect(pace(friday, plan, "2026-11-20")).toMatchObject({ lessons_left: 2, days_left: 1, behind_by: 1 });
    expect(pace(study(friday, "2026-11-20").record, plan, "2026-11-20")).toMatchObject({ lessons_left: 1, days_left: 0, behind_by: 1 });
  });
});

describe("reminders", () => {
  it("planned-day on a study day with no session yet; none after studying", () => {
    const r = placed();
    expect(reminderToday(r, MON)).toBe("planned_day");
    expect(reminderToday(study(r, MON).record, MON)).toBeNull();
  });

  it("missed-day the day after a planned study day with no session", () => {
    const r = study(placed(), MON).record;
    expect(reminderToday(r, TUE)).toBe("planned_day");
    expect(reminderToday(r, WED)).toBe("missed_day");
  });

  it("no missed-day for days before the learner started, nor after a rest day", () => {
    expect(reminderToday(placed(TUE), TUE)).toBe("planned_day");
    const p = profile({ study_days: ["mon", "thu"] });
    expect(reminderToday(study(placed(MON, p), MON).record, WED)).toBeNull();
  });
});

describe("calendar", () => {
  it("marks done, missed, planned and rest days", () => {
    const p = profile({ study_days: ["mon", "tue", "wed", "thu", "fri"], deadline: "2026-11-20" });
    const r = study(placed(MON, p), MON).record;
    const days = calendar(r, WED, "2026-11-15", "2026-11-21");
    expect(days.map((d) => d.status)).toEqual(["rest", "done", "missed", "planned", "planned", "rest", "rest"]);
    expect(days.find((d) => d.is_today)?.date).toBe(WED);
    expect(days.find((d) => d.is_deadline)?.date).toBe("2026-11-20");
  });
});

describe("why lines (COPY.md)", () => {
  it("only claims 'on track' when the pace line says so", () => {
    const r = study(placed(MON, profile({ deadline: TUE })), MON).record; // 2 lessons left, 0 study days
    expect(orderOf(pickNext(r, plan, MON)).why).toBe("Next up: **Unit u03**.");
  });

  it("names two fresh misses as 'earlier'", () => {
    const r = study(placed(), MON, ["q1", "q2"]).record; // u02 needs_review; alpha, beta due TUE
    const r2 = { ...r, units: { ...r.units, u02: { status: "done" as const, score: 1, last_seen: MON } } };
    expect(orderOf(pickNext(r2, plan, TUE)).why).toBe("You missed “alpha” and “beta” earlier, so today starts with a quick review, then **Unit u03**.");
  });

  it("catch-up says how many planned days were missed and names due reviews", () => {
    const r = study(placed(), MON, ["q3"]).record;
    expect(orderOf(pickNext(r, plan, THU)).why).toBe(
      "You missed 2 planned days. Here's a shorter 10-minute recap of **Unit u02** to get you back in. It starts with a quick review of “gamma”.",
    );
  });
});

describe("survey skip", () => {
  it("units the learner skips in the survey start as known", () => {
    const r = { ...startCourse(newRecord("l1"), "test", plan), profile: profile({ skip: ["Unit u03 "] }) };
    const out = gradePlacement(r, plan, { p01: 1, p02: 1, p03: 1 }, MON).record;
    expect(out.units.u03).toEqual({ status: "known", score: null, last_seen: MON });
    expect(out.units.u01.status).toBe("todo");
    expect(orderOf(pickNext(out, plan, MON)).unit.unit_id).toBe("u01");
  });
});

describe("locked lessons", () => {
  const states = (r: LearnerRecord, day: string) => lessonStates(r, plan, day).map((i) => `${i.unit_id}:${i.state}`);

  it("after the short test: known stays open to re-read, one unit is next, the rest are locked", () => {
    const items = lessonStates(placed(), plan, MON);
    expect(items.map((i) => i.state)).toEqual(["known", "next", "locked", "locked"]);
    expect(items[1]).toMatchObject({ mode: "new", minutes: 15, date: MON, date_kind: "planned" });
    expect(items.slice(2).map((i) => i.date)).toEqual([TUE, WED]);
    expect(items[0]).toMatchObject({ date: MON, date_kind: "tested", mode: null });
    expect(items.filter((i) => i.state === "next")).toHaveLength(1);
  });

  it("passing the open lesson unlocks the next unit", () => {
    const r = study(placed(), MON).record;
    expect(states(r, MON)).toEqual(["u01:known", "u02:done", "u03:next", "u04:locked"]);
    const items = lessonStates(r, plan, MON);
    expect(items[1]).toMatchObject({ date: MON, date_kind: "studied" });
    expect(items[2].date).toBe(TUE); // studied today, so the next lesson is planned for the next study day
  });

  it("failing keeps the same unit open as a review; later units stay locked", () => {
    const r = study(placed(), MON, ["q1", "q2"]).record;
    expect(states(r, TUE)).toEqual(["u01:known", "u02:next", "u03:locked", "u04:locked"]);
    expect(lessonStates(r, plan, TUE)[1].mode).toBe("review");
  });

  it("after missed days the catch-up unit is the open one, even when it was done", () => {
    const r = study(placed(), MON).record;
    expect(states(r, WED)).toEqual(["u01:known", "u02:next", "u03:locked", "u04:locked"]);
    expect(lessonStates(r, plan, WED)[1]).toMatchObject({ mode: "catch_up", minutes: 10 });
  });

  it("after passing the catch-up, the next unit unlocks", () => {
    let r = study(placed(), MON).record;
    r = study(r, WED).record; // catch_up on u02, passed
    expect(states(r, WED)).toEqual(["u01:known", "u02:done", "u03:next", "u04:locked"]);
  });

  it("finish state: nothing is next or locked", () => {
    let r = placed();
    for (const day of [MON, TUE, WED]) r = study(r, day).record;
    expect(lessonStates(r, plan, THU).map((i) => i.state)).toEqual(["known", "done", "done", "done"]);
  });

  it("planned dates put two lessons on a day when the session holds two", () => {
    const r = placed(MON, profile({ minutes_per_day: 30 }));
    const items = lessonStates(r, plan, MON);
    expect(items.slice(1).map((i) => i.date)).toEqual([MON, MON, TUE]);
    expect(items.slice(1).map((i) => i.minutes)).toEqual([15, 15, 15]);
    // After the first of today's two lessons, the second is still planned for today.
    const one = study(r, MON).record;
    expect(lessonStates(one, plan, MON).slice(2).map((i) => i.date)).toEqual([MON, TUE]);
    // Today's choice decides today; later days follow the profile.
    expect(lessonStates(r, plan, MON, 15).slice(1).map((i) => i.date)).toEqual([MON, TUE, TUE]);
    expect(lessonStates(placed(), plan, MON, 30).slice(1).map((i) => i.date)).toEqual([MON, MON, TUE]);
    expect(lessonStates(placed(), plan, MON, 30)[1]).toMatchObject({ state: "next", minutes: 15 });
  });

  it("only covered units can be re-read", () => {
    expect(["done", "known", "needs_review"].every((s) => canReread(s as never))).toBe(true);
    expect(canReread("locked")).toBe(false);
    expect(canReread("next")).toBe(false);
    expect(canReread(null)).toBe(false);
  });
});

describe("the level, the mission and the learning digest sent with an order", () => {
  it("one lesson at 1.0 is standard, two in a row at 0.8 or above are stretch, a review is support, a catch-up is standard", () => {
    const one = study(placed(), MON).record;
    expect(one.sessions.map((s) => s.score)).toEqual([1]);
    expect(levelFor(one, "new")).toBe("standard");
    expect(orderOf(pickNext(one, plan, TUE)).level).toBe("standard");

    const two = study(one, TUE).record;
    expect(levelFor(two, "new")).toBe("stretch");
    expect(levelFor(two, "review")).toBe("support");
    expect(levelFor(two, "catch_up")).toBe("standard");

    // 0.67 is under 0.8, so two lessons in a row are not enough on their own.
    const mixed = study(one, TUE, ["q1"]).record;
    expect(levelFor(mixed, "new")).toBe("standard");

    // A failed lesson comes back as a review, taught with more support.
    const failed = study(placed(), MON, ["q1", "q2", "q3"]).record;
    expect(orderOf(pickNext(failed, plan, TUE))).toMatchObject({ mode: "review", level: "support" });
  });

  it("a stretch order says why: its reason ends with the faster-and-further line", () => {
    const two = study(study(placed(), MON).record, TUE).record;
    const order = orderOf(pickNext(two, plan, WED));
    expect(order).toMatchObject({ mode: "new", level: "stretch" });
    expect(order.why.endsWith("so today moves faster and goes further.")).toBe(true);
    // A standard order does not carry the line.
    expect(orderOf(pickNext(study(placed(), MON).record, plan, TUE)).why).not.toContain("moves faster");
  });

  it("missionOf leaves out blocker_note and counts days_to_exam from today", () => {
    const p = profile({ blocker_note: "Kids and family", deadline: addDays(MON, 10), focus: ["Unit u02"], skip: ["Unit u04"] });
    const mission = missionOf(p, MON);
    expect(mission).toEqual({
      course: "Test course",
      why: "Get promoted",
      success: "Pass",
      focus: ["Unit u02"],
      out_of_scope: ["Unit u04"],
      minutes_per_day: 15,
      days_to_exam: 10,
      obstacle: "time",
    });
    expect(JSON.stringify(mission)).not.toContain("Kids and family");
    expect(missionOf(p, addDays(MON, 3)).days_to_exam).toBe(7);
    // The order carries the same mission, counted from the day it is picked.
    expect(orderOf(pickNext(placed(MON, p), plan, TUE)).mission).toMatchObject({ days_to_exam: 9, obstacle: "time" });
  });

  it("learnedOf lists passed units as demonstrated, known units as claimed, and missed concepts with their topic", () => {
    const first = study(placed(), MON).record; // u02 passed with every answer right
    const second = study(first, TUE, ["q1"]).record; // u03 passed at 2 of 3, "alpha" missed
    const digest = learnedOf(second, plan);
    expect(digest.starting_point).toBe("None");
    expect(digest.claimed).toEqual(["Unit u01"]);
    expect(digest.demonstrated.map((d) => d.topic)).toEqual(["Unit u02", "Unit u03"]);
    expect(digest.demonstrated[0].score).toBe(1);
    expect(digest.demonstrated[1].score).toBeCloseTo(2 / 3, 2);
    expect(digest.misconceptions).toEqual([{ concept: "alpha", topic: "Unit u03", times_missed: 1 }]);
    expect(orderOf(pickNext(second, plan, WED)).learned).toEqual(digest);
  });
});
