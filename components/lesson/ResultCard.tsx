"use client";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui";
import type { LessonResult } from "@/lib/api-types";
import { copy } from "@/lib/content";
import { lessonCopy as t } from "@/lib/copy/pages";
import { shortDate } from "@/lib/dates";

export function ResultCard({
  result,
  onNext,
  onPlan,
  onSkip,
  skipping,
  more,
  finished = false,
}: {
  /** Set when today's session holds another lesson (a session of 25 minutes or more is two short lessons). */
  more?: { done: number; total: number };
  /** True when this lesson was the last topic: there is no next lesson, only the finish page. */
  finished?: boolean;
  result: LessonResult;
  onNext: () => void;
  onPlan: () => void;
  onSkip: () => void;
  skipping: boolean;
}) {
  const right = result.quiz.filter((r) => r.correct).length;
  const passed = result.status === "done";
  return (
    <section aria-labelledby="result-title" className="space-y-4 rounded-card border border-line bg-surface p-5 md:p-6">
      <h2 id="result-title" className={`flex items-start gap-2 text-h2 ${passed ? "text-accent-strong" : "text-warn"}`}>
        <Icon name={passed ? "check-circle" : "refresh"} className="mt-1 size-6" />
        {passed ? t.resultPass(right, result.quiz.length) : t.resultFail(right, result.quiz.length)}
      </h2>
      {result.coming_back.length > 0 && (
        <div className="rounded-control bg-surface-muted p-4">
          <p className="text-small font-semibold text-ink">{t.comingBack}</p>
          <ul className="mt-2 space-y-1">
            {result.coming_back.map((c) => (
              <li key={c.concept} className="text-body text-ink">
                “{c.concept}” <span className="text-ink-muted">on {shortDate(c.review_due)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {finished ? (
        <>
          <p className="flex items-center gap-2 text-body text-ink">
            <Icon name="check-circle" className="size-5 text-accent-strong" />
            {t.courseFinished}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-12" onClick={onNext}>
              {t.toFinish}
            </Button>
            <Button variant="secondary" className="h-12" onClick={onPlan}>
              {t.backToPlan}
            </Button>
          </div>
        </>
      ) : more ? (
        <>
          <p className="flex items-center gap-2 text-body text-ink">
            <Icon name="clock" className="size-5 text-ink-muted" />
            {copy.session.oneMore(more.done, more.total)}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button className="h-12" onClick={onNext}>
              {copy.session.startNext(more.done + 1, more.total)}
            </Button>
            <Button variant="secondary" className="h-12" onClick={onPlan}>
              {t.backToPlan}
            </Button>
          </div>
        </>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <Button className="h-12" onClick={onPlan}>
            {t.backToPlan}
          </Button>
          <Button variant="secondary" className="h-12" onClick={onNext}>
            {t.nextLesson}
          </Button>
        </div>
      )}
      {/* With the course finished there is no next lesson for tomorrow to change. */}
      {!finished && (
        <div className="space-y-2 rounded-control border border-dashed border-warn-line bg-warn-soft p-4">
          <p className="text-small text-ink">{t.demoHint}</p>
          <Button variant="secondary" className="w-full" onClick={onSkip} disabled={skipping}>
            <Icon name="clock" />
            {skipping ? t.demoSkipping : t.demoSkip}
          </Button>
        </div>
      )}
    </section>
  );
}
