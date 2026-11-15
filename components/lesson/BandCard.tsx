// A titled card: a title, its content and a border. (It once had a coloured band and a floating icon.)
import type { ReactNode } from "react";

export function BandCard({ title, children, className = "", labelledBy }: { title: ReactNode; children: ReactNode; className?: string; labelledBy: string }) {
  return (
    <section aria-labelledby={labelledBy} className={`space-y-4 rounded-card border border-line bg-surface p-5 md:p-6 ${className}`}>
      <h2 id={labelledBy} className="text-h2 text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}
