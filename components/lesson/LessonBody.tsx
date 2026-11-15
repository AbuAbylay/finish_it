// The reading part of a lesson: sections with their source quotes, then key points.
import { Markdown } from "@/components/Markdown";
import type { PresentedLesson } from "@/lib/api-types";
import { lessonCopy as t } from "@/lib/copy/pages";
import { SourceQuote } from "./SourceQuote";

export function LessonBody({ lesson }: { lesson: PresentedLesson["lesson"] }) {
  return (
    <div className="space-y-6">
      {lesson.sections.map((s, i) => (
        <section key={i} className="space-y-2">
          <h2 className="text-h2 text-ink">{s.heading}</h2>
          <Markdown>{s.body_md}</Markdown>
          {s.source_quote && <SourceQuote quote={s.source_quote} />}
        </section>
      ))}
      {lesson.key_points.length > 0 && (
        <section className="border-y border-line py-5" aria-labelledby="key-points">
          <h2 id="key-points" className="text-h3 text-ink">
            {t.keyPoints}
          </h2>
          <ul className="mt-3 space-y-2">
            {lesson.key_points.map((k) => (
              <li key={k} className="flex gap-2 text-body text-ink">
                <span aria-hidden className="text-ink-muted">
                  •
                </span>
                {k}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
