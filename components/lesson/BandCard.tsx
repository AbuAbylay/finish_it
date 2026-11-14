// Card with a soft illustrated header band (docs/design.md §5 Card).
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";

const BANDS = { green: "band-green", sand: "band-sand", sky: "band-sky" } as const;

export function BandCard({
  band,
  icon,
  title,
  children,
  className = "",
  labelledBy,
}: {
  band: keyof typeof BANDS;
  icon: IconName;
  title: ReactNode;
  children: ReactNode;
  className?: string;
  labelledBy: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className={`overflow-hidden rounded-card border border-line bg-surface shadow-card ${className}`}>
      <div className={`relative h-20 md:h-24 ${BANDS[band]}`}>
        <span className="absolute -bottom-6 left-5 grid size-12 place-items-center rounded-full bg-surface text-ink shadow-card md:left-6">
          <Icon name={icon} className="size-6" />
        </span>
      </div>
      <div className="space-y-4 p-5 pt-9 md:p-6 md:pt-10">
        <h2 id={labelledBy} className="text-h2 text-ink">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
