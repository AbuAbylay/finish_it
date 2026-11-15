import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

export function EmptyState({ icon, title, line, action }: { icon: IconName; title: string; line: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <span className="grid size-10 place-items-center rounded-full bg-info-soft text-info">
        <Icon name={icon} className="size-6" />
      </span>
      <div>
        <p className="text-h3 text-ink">{title}</p>
        <p className="text-small text-ink-muted">{line}</p>
      </div>
      {action}
    </div>
  );
}
