// Every learner-facing date goes through today(). Dates are plain "YYYY-MM-DD" strings,
// and all arithmetic below is done in UTC on those strings, so it is pure and timezone-safe.
import { WEEKDAYS, type Weekday } from "./types";

const DAY_MS = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const t = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === value;
}

function toMs(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** The calendar date at `now` in `timeZone` (falls back to UTC for an unknown zone). */
export function calendarDate(now: Date, timeZone = "UTC"): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * The learner's "today": the real date in their time zone plus demo_day_offset (PROJECT §5).
 * This is the only place learner logic reads the clock.
 */
export function today(demoDayOffset: number, timeZone = "UTC", now: Date = new Date()): string {
  return addDays(calendarDate(now, timeZone), demoDayOffset);
}

export function addDays(date: string, days: number): string {
  return fromMs(toMs(date) + days * DAY_MS);
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: string, b: string): number {
  return Math.round((toMs(b) - toMs(a)) / DAY_MS);
}

export function weekdayOf(date: string): Weekday {
  // getUTCDay: 0 = Sunday. WEEKDAYS starts on Monday.
  return WEEKDAYS[(new Date(toMs(date)).getUTCDay() + 6) % 7];
}

export function isStudyDay(date: string, studyDays: readonly Weekday[]): boolean {
  return studyDays.includes(weekdayOf(date));
}

/** The first planned study day strictly after `date`. Falls back to the next calendar day if no days are planned. */
export function nextStudyDay(date: string, studyDays: readonly Weekday[]): string {
  if (studyDays.length === 0) return addDays(date, 1);
  let d = addDays(date, 1);
  while (!isStudyDay(d, studyDays)) d = addDays(d, 1);
  return d;
}

/** Planned study days d with from < d < to (both ends excluded). */
export function studyDaysStrictlyBetween(from: string, to: string, studyDays: readonly Weekday[]): string[] {
  const out: string[] = [];
  for (let d = addDays(from, 1); d < to; d = addDays(d, 1)) {
    if (isStudyDay(d, studyDays)) out.push(d);
  }
  return out;
}

/** Planned study days d with from <= d < to. */
export function countStudyDays(from: string, to: string, studyDays: readonly Weekday[]): number {
  let n = 0;
  for (let d = from; d < to; d = addDays(d, 1)) {
    if (isStudyDay(d, studyDays)) n++;
  }
  return n;
}
