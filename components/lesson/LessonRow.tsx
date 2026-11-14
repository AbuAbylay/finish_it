// One unit on the lessons page (docs/design.md §5 LessonRow): date block, title, meta, status.
import Link from "next/link";
import { Icon } from "@/components/icons";
import { StatusPill } from "@/components/StatusPill";
import type { LessonListItem } from "@/lib/api-types";
import { lessonsCopy, modeLabel } from "@/lib/copy/pages";
import { shortDate, weekdayOf } from "@/lib/dates";

const WEEKDAY: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function meta(item: LessonListItem, today: string): string {
  const parts: string[] = [];
  if (item.state === "next" && item.mode && item.mode !== "new") parts.push(modeLabel[item.mode]);
  if (item.date_kind === "tested") {
    parts.push(lessonsCopy.fromCheck);
    return parts.join(" · ");
  }
  parts.push(lessonsCopy.minutes(item.minutes));
  if (item.date && item.date_kind === "studied") parts.push(lessonsCopy.studied(shortDate(item.date)));
  if (item.date && item.date_kind === "planned") parts.push(item.date === today ? lessonsCopy.today : lessonsCopy.planned(shortDate(item.date)));
  return parts.join(" · ");
}

export function LessonRow({ item, today, href }: { item: LessonListItem; today: string; href: string | null }) {
  const locked = item.state === "locked";
  const next = item.state === "next";
  const dateBlock =
    item.state === "done" ? "bg-accent-soft text-accent-strong" : item.state === "known" ? "bg-info-soft text-info" : "bg-surface-muted text-ink";

  const body = (
    <>
      <div className={`grid w-date-block shrink-0 place-items-center self-stretch rounded-cell py-1 ${dateBlock}`} aria-hidden={!item.date}>
        {item.state === "known" ? (
          <Icon name="check-circle" className="size-6" />
        ) : item.date ? (
          <span className="text-center">
            <span className="block text-caption uppercase">{WEEKDAY[weekdayOf(item.date)]}</span>
            <span className="block text-h2">{Number(item.date.slice(8))}</span>
          </span>
        ) : (
          <span className="text-h3 text-ink-faint">–</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`line-clamp-2 text-h3 ${locked ? "text-ink-muted" : "text-ink"}`}>{item.title}</p>
        <p className="text-small text-ink-muted">{meta(item, today)}</p>
        <div className="min-[400px]:hidden">
          <StatusPill state={item.state} />
        </div>
      </div>
      <div className="hidden items-center gap-2 min-[400px]:flex">
        <StatusPill state={item.state} />
        {next && <Icon name="chevron-right" className="size-5 text-ink" />}
      </div>
    </>
  );

  const base = `flex min-h-[72px] items-center gap-3 rounded-control bg-surface p-3 ${next ? "border-2 border-primary" : "border border-line"}`;

  if (!href || locked) {
    return (
      <div className={base} aria-disabled={locked || undefined} title={locked ? lessonsCopy.lockedHint : undefined}>
        {body}
      </div>
    );
  }
  return (
    <Link href={href} className={`${base} transition-shadow hover:shadow-raised`}>
      {body}
    </Link>
  );
}
