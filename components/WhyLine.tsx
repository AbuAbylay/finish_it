// The why line from code (PROJECT §5 rule 5). `**bold**` marks the unit title.
import type { ReactNode } from "react";

/** Renders **bold** spans from a plain string. Nothing else is interpreted. */
export function withBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

export function WhyLine({ text, label = "Why this lesson" }: { text: string; label?: string }) {
  return (
    <div className="rounded-card border border-warn-line bg-warn-soft p-4">
      <p className="text-caption uppercase text-warn">{label}</p>
      <p className="mt-1 text-body text-ink">{withBold(text)}</p>
    </div>
  );
}
