"use client";
// Month grid shared by the calendar popover and the /plan page (docs/design.md, CalendarPopover cells).
import type { CalendarDay, CalendarResponse } from "@/lib/api-types";
import { copy } from "@/lib/content";
import { shortDate } from "@/lib/dates";
import { Icon, type IconName } from "../icons";
import { IconButton } from "../ui";
import { monthTitle } from "./useCalendar";

const c = copy.calendar;

type Day = CalendarDay & { in_month: boolean };

function cellStyle(d: Day): { cls: string; glyph: IconName | null; text: string } {
  if (d.is_deadline) return { cls: "bg-primary text-on-primary", glyph: "flag", text: c.cell.exam };
  if (d.status === "done") return { cls: "bg-accent text-on-primary", glyph: "check", text: c.cell.done };
  if (d.status === "missed") return { cls: "bg-danger-soft text-danger", glyph: "close", text: c.cell.missed };
  // Today is filled with the marker's soft yellow unless the cell already carries a state fill (studied, missed).
  const fill = d.is_today ? "bg-highlight-soft" : "";
  if (d.status === "planned") return { cls: `border border-line-strong text-ink ${fill || "bg-surface"}`, glyph: null, text: c.cell.planned };
  return { cls: d.is_today ? `text-ink ${fill}` : "text-ink-faint", glyph: null, text: c.cell.rest };
}

export function CalendarHeader({
  month,
  titleId,
  onPrev,
  onNext,
}: {
  month: string;
  titleId: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={titleId} tabIndex={-1} className="text-h3 text-ink focus:outline-none">
        {monthTitle(month)}
      </h2>
      <div className="flex items-center">
        <IconButton icon="chevron-left" label={c.prev} onClick={onPrev} />
        <IconButton icon="chevron-right" label={c.next} onClick={onNext} />
      </div>
    </div>
  );
}

export function CalendarMonth({ data }: { data: CalendarResponse }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 gap-1 text-center text-caption text-ink-muted" aria-hidden>
        {c.weekdays.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1" aria-label={monthTitle(data.month)}>
        {data.days.map((d) => {
          const s = cellStyle(d);
          const label = `${shortDate(d.date)}: ${s.text}${d.is_today ? `, ${c.cell.today}` : ""}`;
          return (
            <li
              key={d.date}
              className={`relative grid aspect-square min-h-10 place-items-center rounded-cell text-small font-semibold ${s.cls} ${d.in_month ? "" : "opacity-40"} ${d.is_today ? "outline-2 outline-offset-1 outline-ink" : ""}`}
            >
              <span aria-hidden>{Number(d.date.slice(8))}</span>
              {s.glyph && <Icon name={s.glyph} className="absolute right-0.5 bottom-0.5 size-3" />}
              <span className="sr-only">{label}</span>
            </li>
          );
        })}
      </ol>
      <Legend />
    </div>
  );
}

function Legend() {
  const items: { label: string; cls: string; glyph: IconName | null }[] = [
    { label: c.legend.done, cls: "bg-accent text-on-primary", glyph: "check" },
    { label: c.legend.missed, cls: "bg-danger-soft text-danger", glyph: "close" },
    { label: c.legend.planned, cls: "border border-line-strong bg-surface", glyph: null },
    { label: c.legend.today, cls: "outline-2 outline-offset-1 outline-ink bg-highlight-soft", glyph: null },
    { label: c.legend.exam, cls: "bg-primary text-on-primary", glyph: "flag" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-small text-ink-muted">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={`grid size-4 place-items-center rounded ${i.cls}`} aria-hidden>
            {i.glyph && <Icon name={i.glyph} className="size-3" />}
          </span>
          {i.label}
        </li>
      ))}
    </ul>
  );
}
