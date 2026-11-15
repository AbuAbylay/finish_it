// Status pill: color, icon and text together (docs/design.md §1). Color is never the only signal.
import type { LessonState } from "@/lib/rules";
import { Icon, type IconName } from "./icons";

const STYLE: Record<LessonState, { cls: string; icon: IconName; label: string }> = {
  done: { cls: "bg-accent-soft text-accent-strong", icon: "check", label: "Done" },
  known: { cls: "bg-info-soft text-info", icon: "check-circle", label: "Known" },
  needs_review: { cls: "bg-warn-soft text-warn", icon: "refresh", label: "Needs review" },
  next: { cls: "bg-primary text-on-primary", icon: "lessons", label: "Up next" },
  locked: { cls: "bg-locked-soft text-locked", icon: "lock", label: "Locked" },
};

export const STATUS_LABEL: Record<LessonState, string> = Object.fromEntries(
  Object.entries(STYLE).map(([k, v]) => [k, v.label]),
) as Record<LessonState, string>;

export function StatusPill({ state, label }: { state: LessonState; label?: string }) {
  const s = STYLE[state];
  return (
    <span className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-small font-semibold ${s.cls}`}>
      <Icon name={s.icon} className="size-4" />
      {label ?? s.label}
    </span>
  );
}
