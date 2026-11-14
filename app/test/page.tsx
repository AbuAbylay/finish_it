"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { QuestionCard } from "@/components/QuestionCard";
import { Shell } from "@/components/Shell";
import { Button, Card, ErrorCard, Skeleton, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { PlacementResponse, PublicQuestion } from "@/lib/api-types";
import { api, clearDraft, learnerId, loadDraft, saveDraft } from "@/lib/client";
import { copy } from "@/lib/content";

const t = copy.test;

export default function PlacementTest() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["test"]);
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PlacementResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await api<{ questions: PublicQuestion[] }>("/api/placement");
    if (!res.ok) return setError(res.error);
    setQuestions(res.data.questions);
    setAnswers(loadDraft<Record<string, number>>("placement") ?? {});
  }

  useEffect(() => {
    if (me) void load();
  }, [me]);

  function choose(id: string, index: number) {
    setAnswers((prev) => {
      const next = { ...prev, [id]: index };
      saveDraft("placement", next);
      return next;
    });
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await api<PlacementResponse>("/api/placement", { method: "POST", body: { answers } });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    clearDraft("placement");
    setResult(res.data);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (gateError) return <Shell><ErrorCard message={gateError} onRetry={reload} /></Shell>;

  if (result) {
    return (
      <Shell>
        <div className="space-y-6">
          <h1 className="text-2xl font-bold tracking-tight">{t.resultTitle}</h1>
          <Card className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{t.knownLabel}</p>
            {result.known.length === 0 ? (
              <p className="text-base text-stone-700">{t.knownNone}</p>
            ) : (
              <ul className="space-y-2">
                {result.known.map((k) => (
                  <li key={k} className="flex gap-2 text-base">
                    <span className="text-emerald-700" aria-hidden>✓</span>
                    {k}
                  </li>
                ))}
              </ul>
            )}
            <p className="border-t border-stone-100 pt-3 text-lg font-semibold">{t.lessonsLabel(result.lessons_left)}</p>
          </Card>
          <Button className="w-full" onClick={() => router.push("/lesson")}>
            {t.start}
          </Button>
        </div>
      </Shell>
    );
  }

  const answered = questions ? questions.filter((q) => q.question_id in answers).length : 0;
  const complete = !!questions && answered === questions.length;

  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">{t.title}</h1>
          <p className="text-base text-stone-600">{t.sub}</p>
        </div>
        {error && <ErrorCard message={error} onRetry={questions ? submit : load} />}
        {!questions && !error && (
          <Card>
            <Skeleton lines={5} />
          </Card>
        )}
        {questions?.map((q, i) => (
          <Card key={q.question_id}>
            <QuestionCard
              q={q}
              number={i + 1}
              seed={learnerId()}
              chosen={answers[q.question_id]}
              onChoose={(idx) => choose(q.question_id, idx)}
              dontKnowLabel={t.dontKnow}
            />
          </Card>
        ))}
        {questions && (
          <div className="sticky bottom-0 -mx-4 border-t border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur">
            {busy ? (
              <Spinner label={t.submitting} />
            ) : (
              <Button className="w-full" disabled={!complete} onClick={submit}>
                {complete ? t.submit : t.answered(answered, questions.length)}
              </Button>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
