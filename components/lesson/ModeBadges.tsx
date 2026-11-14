// Mode and time badges above a lesson. Each has an icon and text, so color is not the only signal.
import { Icon, type IconName } from "@/components/icons";
import { aboutMinutes, modeLabel } from "@/lib/copy/pages";
import type { Mode } from "@/lib/types";

const MODE: Record<Mode, { cls: string; icon: IconName }> = {
  new: { cls: "bg-surface-muted text-ink", icon: "arrow-right" },
  review: { cls: "bg-warn-soft text-warn", icon: "refresh" },
  catch_up: { cls: "bg-info-soft text-info", icon: "clock" },
};

export function ModeBadges({ mode, minutes }: { mode: Mode; minutes: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-small font-semibold ${MODE[mode].cls}`}>
        <Icon name={MODE[mode].icon} className="size-4" />
        {modeLabel[mode]}
      </span>
      <span className="inline-flex h-7 items-center gap-1 rounded-full bg-surface-muted px-2.5 text-small font-semibold text-ink-muted">
        <Icon name="clock" className="size-4" />
        {aboutMinutes(minutes)}
      </span>
    </div>
  );
}
