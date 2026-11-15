"use client";
// Questions one at a time: pick, Check (the server locks the answer and reveals feedback), Next.
// A refresh resumes at the first unchecked question, because feedback comes back in `checked`.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { QuestionCard } from "@/components/QuestionCard";
import { Button } from "@/components/ui";
import type { PublicQuestion, QuestionResult } from "@/lib/api-types";
import { lessonCopy as t } from "@/lib/copy/pages";

export function QuestionSequence({
  questions,
  seed,
  checked,
  onCheck,
  onDone,
  doneLabel,
  holdLast,
  busy = false,
}: {
  questions: PublicQuestion[];
  seed: string;
  checked: Record<string, QuestionResult>;
  /** Resolves to an error message, or null on success. */
  onCheck: (questionId: string, choice: number) => Promise<string | null>;
  /** Called on the button after the last question. */
  onDone: () => void;
  doneLabel: string;
  /** Keep showing the last question (with its feedback) once everything is checked, until onDone runs. */
  holdLast: boolean;
  busy?: boolean;
}) {
  const [advanced, setAdvanced] = useState<Set<string>>(() => {
    const done = new Set(questions.filter((q) => q.question_id in checked).map((q) => q.question_id));
    if (holdLast && done.size === questions.length && questions.length > 0) done.delete(questions[questions.length - 1].question_id);
    return done;
  });
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const index = questions.findIndex((q) => !advanced.has(q.question_id));

  // After "Next question" the new question starts under the top bar, not above the window.
  const top = useRef<HTMLDivElement>(null);
  const shownIndex = useRef(index);
  useEffect(() => {
    if (shownIndex.current === index) return;
    shownIndex.current = index;
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    top.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  }, [index]);

  if (index === -1) return null;
  const q = questions[index];
  const fb = checked[q.question_id];
  const isLast = index === questions.length - 1;
  const choice = selected[q.question_id];

  async function check() {
    if (choice === undefined) return;
    setChecking(true);
    setError(null);
    const err = await onCheck(q.question_id, choice);
    setChecking(false);
    if (err) setError(err);
  }

  function next() {
    if (isLast) return onDone();
    setAdvanced(new Set([...advanced, q.question_id]));
  }

  return (
    <div ref={top} className="scroll-mt-20 space-y-4">
      <QuestionCard
        key={q.question_id}
        q={q}
        label={t.questionOf(index + 1, questions.length)}
        seed={seed}
        chosen={choice}
        onChoose={(i) => setSelected({ ...selected, [q.question_id]: i })}
        feedback={fb}
        disabled={checking}
      />
      {error && (
        <p role="alert" className="flex items-start gap-2 text-small text-danger">
          <Icon name="alert" className="mt-0.5 size-4" />
          {error}
        </p>
      )}
      {fb ? (
        <Button className="h-12 w-full sm:w-auto" onClick={next} disabled={busy}>
          {isLast ? doneLabel : t.next}
          <Icon name="arrow-right" />
        </Button>
      ) : (
        <Button className="h-12 w-full sm:w-auto" onClick={check} disabled={choice === undefined || checking}>
          {checking ? t.checking : t.check}
        </Button>
      )}
    </div>
  );
}
