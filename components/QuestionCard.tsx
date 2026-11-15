"use client";
// One multiple-choice question (docs/design.md §5 QuestionCard).
// Options are shuffled for display with a stable seed (`${seed}:${question_id}`); `chosen`, `onChoose`
// and feedback always use the ORIGINAL option index, which is what the server grades.
import { useMemo } from "react";
import { Icon } from "@/components/icons";
import { SourceQuote } from "@/components/lesson/SourceQuote";
import type { PublicQuestion, QuestionResult } from "@/lib/api-types";
import { shuffledIndexes } from "@/lib/client";
import { lessonCopy } from "@/lib/copy/pages";

export function QuestionCard({
  q,
  number,
  label,
  seed,
  chosen,
  onChoose,
  feedback,
  reveal,
  dontKnowLabel,
  disabled = false,
}: {
  q: PublicQuestion;
  /** Shown before the prompt ("1."). */
  number?: number;
  /** Shown above the prompt ("Question 1 of 3"). */
  label?: string;
  seed: string;
  chosen: number | undefined;
  onChoose?: (originalIndex: number) => void;
  /** Feedback after the answer was checked. Locks the card. */
  feedback?: QuestionResult;
  /** @deprecated alias of feedback */
  reveal?: QuestionResult;
  /** Optional extra "don't know" option, sent as -1. */
  dontKnowLabel?: string;
  disabled?: boolean;
}) {
  const fb = feedback ?? reveal;
  const order = useMemo(() => shuffledIndexes(q.options.length, `${seed}:${q.question_id}`), [q.options.length, q.question_id, seed]);
  const locked = !!fb || disabled;
  const shownChoice = fb ? fb.chosen : chosen;

  return (
    <fieldset className="space-y-3">
      <legend className="text-h3 text-ink">
        {label && <span className="mb-2 block text-caption text-ink-muted">{label}</span>}
        {number !== undefined && <span className="mr-2 text-ink-faint">{number}.</span>}
        {q.prompt}
      </legend>
      <div className="grid gap-2">
        {order.map((orig) => {
          const selected = shownChoice === orig;
          const isAnswer = !!fb && fb.correct_index === orig;
          const wrongPick = !!fb && selected && !fb.correct;
          // A 2 px border is drawn as a 1 px border plus a 1 px inset ring, so rows do not move when their state changes.
          let cls = "border-line-strong text-ink hover:border-ink";
          if (!fb && selected) cls = "border-ink ring-1 ring-inset ring-ink text-ink";
          if (fb) cls = "border-line text-ink-muted";
          if (isAnswer) cls = "border-accent ring-1 ring-inset ring-accent text-ink";
          if (wrongPick) cls = "border-danger ring-1 ring-inset ring-danger text-ink";
          return (
            <button
              key={orig}
              type="button"
              disabled={locked}
              aria-pressed={selected}
              onClick={() => onChoose?.(orig)}
              className={`flex min-h-tap w-full flex-wrap items-start gap-x-3 gap-y-1 rounded-control border bg-surface px-4 py-3 text-left text-body transition-colors disabled:cursor-default ${cls}`}
            >
              <span
                className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-primary bg-primary" : "border-line-strong"}`}
                aria-hidden
              >
                {selected && <span className="size-1.5 rounded-full bg-surface" />}
              </span>
              <span className="min-w-0 flex-1 basis-40">{q.options[orig]}</span>
              {isAnswer && (
                <span className="inline-flex shrink-0 items-center gap-1 text-small font-semibold text-accent-strong">
                  <Icon name="check" className="size-4" />
                  Correct answer
                </span>
              )}
              {wrongPick && (
                <span className="inline-flex shrink-0 items-center gap-1 text-small font-semibold text-danger">
                  <Icon name="close" className="size-4" />
                  Your answer
                </span>
              )}
            </button>
          );
        })}
        {dontKnowLabel && !fb && (
          <button
            type="button"
            disabled={locked}
            aria-pressed={chosen === -1}
            onClick={() => onChoose?.(-1)}
            className={`min-h-tap rounded-control border border-dashed px-4 py-3 text-left text-body ${chosen === -1 ? "border-ink ring-1 ring-inset ring-ink text-ink" : "border-line-strong text-ink-muted"}`}
          >
            {dontKnowLabel}
          </button>
        )}
      </div>
      {fb && (
        <div className="space-y-3 pt-1" aria-live="polite">
          {fb.correct ? (
            <p className="flex items-center gap-2 text-body font-semibold text-accent-strong">
              <Icon name="check-circle" />
              {lessonCopy.right}
            </p>
          ) : (
            <p className="flex items-start gap-2 text-body text-ink">
              <Icon name="alert" className="mt-0.5 size-5 text-danger" />
              <span>
                <span className="font-semibold text-danger">{lessonCopy.notQuite}</span>{" "}
                <strong className="font-semibold">{q.options[fb.correct_index]}</strong>.
              </span>
            </p>
          )}
          {fb.explanation && <p className="text-body text-ink">{fb.explanation}</p>}
          {fb.source_quote && <SourceQuote quote={fb.source_quote} />}
        </div>
      )}
    </fieldset>
  );
}
