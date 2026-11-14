"use client";
import { useMemo } from "react";
import type { PublicQuestion, QuestionResult } from "@/lib/api-types";
import { shuffledIndexes } from "@/lib/client";
import { copy } from "@/lib/content";

/**
 * One multiple-choice question. Options are shuffled for display with a stable seed;
 * `chosen` and `onChoose` always use the original option index, which is what the grader expects.
 */
export function QuestionCard({
  q,
  number,
  seed,
  chosen,
  onChoose,
  reveal,
  dontKnowLabel,
}: {
  q: PublicQuestion;
  number: number;
  seed: string;
  chosen: number | undefined;
  onChoose: (originalIndex: number) => void;
  reveal?: QuestionResult;
  dontKnowLabel?: string;
}) {
  const order = useMemo(() => shuffledIndexes(q.options.length, `${seed}:${q.question_id}`), [q.options.length, q.question_id, seed]);
  const locked = !!reveal;

  return (
    <fieldset className="space-y-3">
      <legend className="text-lg font-semibold leading-snug text-stone-900">
        <span className="mr-2 text-stone-400">{number}.</span>
        {q.prompt}
      </legend>
      <div className="grid gap-2">
        {order.map((orig) => {
          const selected = chosen === orig;
          const isAnswer = reveal && reveal.correct_index === orig;
          const wrongPick = reveal && selected && !reveal.correct;
          let cls = "border-stone-300 bg-white text-stone-800 hover:border-stone-400";
          if (!locked && selected) cls = "border-emerald-700 bg-emerald-50 text-emerald-950";
          if (isAnswer) cls = "border-emerald-600 bg-emerald-50 text-emerald-950";
          if (wrongPick) cls = "border-rose-400 bg-rose-50 text-rose-950";
          if (locked && !isAnswer && !wrongPick) cls = "border-stone-200 bg-white text-stone-500";
          return (
            <button
              key={orig}
              type="button"
              disabled={locked}
              aria-pressed={selected}
              onClick={() => onChoose(orig)}
              className={`flex min-h-12 items-start gap-3 rounded-xl border px-4 py-3 text-left text-base transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${cls}`}
            >
              <span
                className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${selected ? "border-current bg-current" : "border-stone-300"}`}
                aria-hidden
              />
              <span className="flex-1">{q.options[orig]}</span>
              {isAnswer && <span className="shrink-0 text-sm font-semibold text-emerald-700">✓</span>}
              {wrongPick && <span className="shrink-0 text-sm font-semibold text-rose-700">✗</span>}
            </button>
          );
        })}
        {dontKnowLabel && !locked && (
          <button
            type="button"
            aria-pressed={chosen === -1}
            onClick={() => onChoose(-1)}
            className={`min-h-12 rounded-xl border border-dashed px-4 py-3 text-left text-base ${chosen === -1 ? "border-stone-700 bg-stone-100 text-stone-900" : "border-stone-300 text-stone-600"}`}
          >
            {dontKnowLabel}
          </button>
        )}
      </div>
      {reveal && (
        <div className={`space-y-2 rounded-xl p-4 text-base ${reveal.correct ? "bg-emerald-50 text-emerald-950" : "bg-amber-50 text-amber-950"}`}>
          <p className="font-semibold">{reveal.correct ? copy.lesson.correct : copy.lesson.wrong}</p>
          {!reveal.correct && reveal.correct_index >= 0 && (
            <p>
              <span className="font-semibold">{copy.lesson.correctAnswer}: </span>
              {q.options[reveal.correct_index]}
            </p>
          )}
          {reveal.explanation && <p>{reveal.explanation}</p>}
          {reveal.source_quote && (
            <blockquote className="border-l-4 border-current/30 pl-3 text-sm italic opacity-90">
              <span className="not-italic font-semibold">{copy.lesson.fromCourse}: </span>“{reveal.source_quote}”
            </blockquote>
          )}
        </div>
      )}
    </fieldset>
  );
}
