// Pace line (PROJECT §5) with COPY.md sentences. Icon + text, never color alone.
import type { Pace } from "@/lib/api-types";
import { copy } from "@/lib/content";
import { Icon } from "../icons";

/** The COPY.md sentence for a pace, split into its status clause and the rest. */
export function paceSentence(p: Pace): { status: string; rest: string; behind: boolean; finished: boolean } {
  if (p.lessons_left === 0) return { status: p.line, rest: copy.pace.finished.replace(/^Course finished\.\s*/, ""), behind: false, finished: true };
  const sentence = !p.on_track
    ? copy.pace.behind(p.behind_by, p.lessons_left, p.days_left)
    : p.days_left - p.lessons_left > 0
      ? copy.pace.onTrackSpare(p.lessons_left, p.days_left, p.days_left - p.lessons_left)
      : copy.pace.onTrackExact;
  const cut = sentence.indexOf(". ");
  return {
    status: cut === -1 ? sentence : sentence.slice(0, cut),
    rest: cut === -1 ? "" : sentence.slice(cut + 2),
    behind: !p.on_track,
    finished: false,
  };
}

export function PaceLine({ pace, size = "md" }: { pace: Pace; size?: "md" | "lg" }) {
  const s = paceSentence(pace);
  const tone = s.behind ? "text-warn" : "text-accent-strong";
  const icon = s.behind ? "alert" : "check-circle";
  if (size === "lg") {
    return (
      <div className="space-y-2">
        <p className={`flex items-center gap-3 text-display ${tone}`}>
          <Icon name={icon} className="size-8" />
          <span>{s.status}</span>
        </p>
        {s.rest && <p className="text-body-lg text-ink">{s.rest}</p>}
        {s.behind && <p className="text-body text-ink-muted">{copy.pace.suggestion}</p>}
      </div>
    );
  }
  return (
    <div className="flex gap-3">
      <Icon name={icon} className={`mt-0.5 size-5 ${tone}`} />
      <div className="space-y-1">
        <p className={`text-h3 ${tone}`}>{s.status}.</p>
        {s.rest && <p className="text-small text-ink">{s.rest}</p>}
        {s.behind && <p className="text-small text-ink-muted">{copy.pace.suggestion}</p>}
      </div>
    </div>
  );
}
