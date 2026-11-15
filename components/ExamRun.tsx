// The run to the exam: one small square per day from the learner's first day to exam day.
// Done days are crossed in green pen, today is marker yellow, planned days are outlined, exam day is ink.
import type { CalendarDay } from "@/lib/api-types";
import { longDate } from "@/lib/dates";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The same picture in words, for screen readers and as the caption under the row. */
export function examRunText(days: CalendarDay[]): string {
  const done = days.filter((d) => d.status === "done").length;
  const missed = days.filter((d) => d.status === "missed").length;
  const today = days.findIndex((d) => d.is_today);
  const left = days.filter((d, i) => d.status === "planned" && i >= today).length;
  const toExam = today === -1 ? 0 : days.length - 1 - today;
  const parts = [`${plural(done, "day")} studied`];
  if (missed > 0) parts.push(`${missed} missed`);
  parts.push(`${plural(left, "study day")} left`);
  const exam = toExam === 0 ? "Your exam is today" : `${plural(toExam, "day")} to your exam on ${longDate(days[days.length - 1].date)}`;
  return `${exam}: ${parts.join(", ")}.`;
}

function square(d: CalendarDay): string {
  if (d.is_deadline) return "bg-ink border-ink";
  if (d.status === "done") return `border-accent text-accent ${d.is_today ? "bg-highlight" : "bg-surface"}`;
  if (d.is_today) return "bg-highlight border-ink";
  if (d.status === "missed") return "border-danger bg-danger-soft";
  if (d.status === "planned") return "border-line-strong bg-surface";
  return "border-line bg-surface-muted";
}

export function ExamRun({ days, className = "" }: { days: CalendarDay[]; className?: string }) {
  if (days.length < 2) return null;
  const text = examRunText(days);
  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap gap-1" role="img" aria-label={text}>
        {days.map((d) => (
          <span key={d.date} className={`grid size-4 place-items-center rounded-[3px] border ${square(d)}`}>
            {d.status === "done" && !d.is_deadline && (
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            )}
          </span>
        ))}
      </div>
      <p className="text-small text-ink-muted" aria-hidden>
        {text}
      </p>
    </div>
  );
}
