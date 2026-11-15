"use client";
// The time chooser that opens a day's session. The server sends the options and how each one splits
// into lessons (lib/rules.ts); this component only shows them. The learner's usual minutes are preselected,
// so one tap on the button starts the lesson.
import { useState } from "react";
import { Icon } from "@/components/icons";
import { Button, Chip, ErrorCard } from "@/components/ui";
import type { SessionResponse } from "@/lib/api-types";
import { copy } from "@/lib/content";

const t = copy.session;

export function MinutesChooser({
  session,
  busy,
  error,
  onStart,
}: {
  session: SessionResponse;
  busy: boolean;
  error: string | null;
  onStart: (minutes: number) => void;
}) {
  const usual = session.options.reduce((best, o) =>
    Math.abs(o.minutes - session.default_minutes) < Math.abs(best.minutes - session.default_minutes) ? o : best,
  );
  const [minutes, setMinutes] = useState(usual.minutes);
  const picked = session.options.find((o) => o.minutes === minutes) ?? usual;

  return (
    <section aria-labelledby="minutes-title" className="space-y-5 rounded-card border border-line bg-surface p-5 md:p-6">
      <header className="space-y-1">
        <h1 id="minutes-title" className="text-h1 text-ink">
          {t.title}
        </h1>
        <p className="text-body text-ink-muted">{t.sub}</p>
      </header>
      <div className="space-y-2">
        <p id="minutes-label" className="text-small font-semibold text-ink">
          {t.groupLabel}
        </p>
        <div role="group" aria-labelledby="minutes-label" className="grid grid-cols-5 gap-2">
          {session.options.map((o) => (
            <Chip key={o.minutes} compact selected={o.minutes === minutes} onClick={() => setMinutes(o.minutes)}>
              {o.minutes}
            </Chip>
          ))}
        </div>
        <p className="flex items-center gap-2 text-body text-ink" aria-live="polite">
          <Icon name="clock" className="size-5 text-ink-muted" />
          {picked.lessons === 2 ? t.twoLessons(picked.lesson_minutes) : t.oneLesson(picked.lesson_minutes)}
        </p>
      </div>
      {error && <ErrorCard message={error} retryable={false} />}
      <Button className="h-12 w-full" onClick={() => onStart(minutes)} busy={busy} busyLabel={t.saving}>
        {t.start}
      </Button>
    </section>
  );
}
