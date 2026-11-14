"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/Markdown";
import { QuestionCard } from "@/components/QuestionCard";
import { Shell } from "@/components/Shell";
import { Button, Card, ErrorCard, Skeleton, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { AnswersResponse, LessonResponse, LessonResult, PresentedLesson, QuestionResult, Stage } from "@/lib/api-types";
import { api, clearDraft, formatDate, loadDraft, saveDraft } from "@/lib/client";
import { copy } from "@/lib/content";
import type { Mode } from "@/lib/types";

const t = copy.lesson;

const MODE_STYLE: Record<Mode, string> = {
  new: "bg-emerald-100 text-emerald-900",
  review: "bg-amber-100 text-amber-900",
  catch_up: "bg-sky-100 text-sky-900",
};

function answersOf(result: LessonResult): Record<string, number> {
  return Object.fromEntries([...result.quiz, ...result.review_quiz].map((r) => [r.question_id, r.chosen]));
}

function keyFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("k");
}

function setUrlKey(key: string | null) {
  window.history.replaceState(null, "", key ? `/lesson?k=${encodeURIComponent(key)}` : "/lesson");
}

export default function LessonPage() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["lesson", "done"]);
  const [data, setData] = useState<PresentedLesson | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<LessonResult | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [loadError, setLoadError] = useState<{ message: string; code: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loadingStep, setLoadingStep] = useState(0);
  const resultRef = useRef<HTMLDivElement>(null);

  async function load(key: string | null) {
    setLoadError(null);
    setSubmitError(null);
    setData(null);
    setResult(null);
    setLoadingStep(0);
    const res = await api<LessonResponse>(key ? `/api/lesson?key=${encodeURIComponent(key)}` : "/api/lesson");
    if (!res.ok) {
      if (key && res.status === 404) {
        setUrlKey(null);
        return load(null);
      }
      return setLoadError({ message: res.error, code: res.code });
    }
    if ("finished" in res.data) return router.replace("/done");
    setData(res.data);
    setResult(res.data.result);
    setAnswers(res.data.result ? answersOf(res.data.result) : (loadDraft<Record<string, number>>(`lesson_${res.data.lesson_key}`) ?? {}));
  }

  useEffect(() => {
    if (!me) return;
    setOffset(me.demo_day_offset);
    void load(keyFromUrl());
  }, [me]);

  // Visible progress while the lesson is being written.
  useEffect(() => {
    if (data || loadError) return;
    const id = setInterval(() => setLoadingStep((s) => Math.min(s + 1, t.loadingSteps.length - 1)), 1800);
    return () => clearInterval(id);
  }, [data, loadError]);

  function choose(id: string, index: number) {
    if (!data || result) return;
    const next = { ...answers, [id]: index };
    setAnswers(next);
    saveDraft(`lesson_${data.lesson_key}`, next);
  }

  async function submit() {
    if (!data) return;
    setSubmitting(true);
    setSubmitError(null);
    const res = await api<AnswersResponse>("/api/answers", { method: "POST", body: { lesson_key: data.lesson_key, answers } });
    setSubmitting(false);
    if (!res.ok) return setSubmitError(res.error);
    clearDraft(`lesson_${data.lesson_key}`);
    setResult(res.data.result);
    setStage(res.data.stage);
    setUrlKey(data.lesson_key);
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function nextLesson() {
    if (stage === "done") return router.push("/done");
    setUrlKey(null);
    window.scrollTo({ top: 0 });
    void load(null);
  }

  async function skipToTomorrow() {
    setSkipping(true);
    const res = await api<{ demo_day_offset: number }>("/api/demo/skip-day", { method: "POST" });
    setSkipping(false);
    if (!res.ok) return setSubmitError(res.error);
    setOffset(res.data.demo_day_offset);
    nextLesson();
  }

  if (gateError) return <Shell nav><ErrorCard message={gateError} onRetry={reload} /></Shell>;

  if (loadError) {
    const limited = loadError.code === "rate_limited";
    return (
      <Shell nav demoOffset={offset}>
        <div className="space-y-4">
          {limited && <h1 className="text-xl font-bold">{t.rateLimited}</h1>}
          <ErrorCard message={loadError.message} onRetry={() => load(keyFromUrl())} retryable={!limited} />
          <Link href="/plan" className="inline-flex min-h-12 items-center font-semibold text-stone-700 underline underline-offset-4">
            {t.toPlan}
          </Link>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell nav demoOffset={offset}>
        <div className="space-y-6">
          <Spinner label={t.loadingSteps[loadingStep]} />
          <Card className="space-y-6">
            <div className="h-7 w-2/3 animate-pulse rounded bg-stone-200" />
            <Skeleton lines={4} />
            <Skeleton lines={3} />
          </Card>
        </div>
      </Shell>
    );
  }

  const { order, lesson } = data;
  const reveal = new Map<string, QuestionResult>(result ? [...result.quiz, ...result.review_quiz].map((r) => [r.question_id, r]) : []);
  const all = [...lesson.review_quiz, ...lesson.quiz];
  const unanswered = all.filter((q) => !(q.question_id in answers)).length;
  const right = result ? result.quiz.filter((r) => r.correct).length : 0;
  const seed = data.lesson_key;

  return (
    <Shell nav demoOffset={offset}>
      <article className="space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span className={`rounded-full px-3 py-1 ${MODE_STYLE[order.mode]}`}>{t.modes[order.mode]}</span>
            <span className="rounded-full bg-stone-200 px-3 py-1 text-stone-700">{t.minutes(order.minutes)}</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{lesson.title}</h1>
        </header>

        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-800">{t.why}</p>
          <p className="mt-1 text-base leading-relaxed text-amber-950">{order.why}</p>
        </div>

        {lesson.sections.map((s, i) => (
          <section key={i} className="space-y-2">
            <h2 className="text-xl font-bold tracking-tight">{s.heading}</h2>
            <Markdown>{s.body_md}</Markdown>
            {s.source_quote && (
              <blockquote className="rounded-r-xl border-l-4 border-emerald-600 bg-emerald-50/60 py-2 pr-3 pl-4 text-base text-stone-700">
                <span className="block text-xs font-bold uppercase tracking-wide text-emerald-800">{t.fromCourse}</span>
                <span className="italic">“{s.source_quote}”</span>
              </blockquote>
            )}
          </section>
        ))}

        {lesson.key_points.length > 0 && (
          <Card className="bg-stone-50">
            <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">{t.keyPoints}</h2>
            <ul className="mt-3 space-y-2">
              {lesson.key_points.map((k) => (
                <li key={k} className="flex gap-2 text-base">
                  <span className="text-emerald-700" aria-hidden>•</span>
                  {k}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {lesson.review_quiz.length > 0 && (
          <Card className="space-y-6 border-amber-200">
            <h2 className="text-lg font-bold">{t.reviewTitle}</h2>
            {lesson.review_quiz.map((q, i) => (
              <QuestionCard key={q.question_id} q={q} number={i + 1} seed={seed} chosen={answers[q.question_id]} onChoose={(x) => choose(q.question_id, x)} reveal={reveal.get(q.question_id)} />
            ))}
          </Card>
        )}

        <Card className="space-y-6">
          <h2 className="text-lg font-bold">{t.quizTitle}</h2>
          {lesson.quiz.map((q, i) => (
            <QuestionCard key={q.question_id} q={q} number={i + 1} seed={seed} chosen={answers[q.question_id]} onChoose={(x) => choose(q.question_id, x)} reveal={reveal.get(q.question_id)} />
          ))}
        </Card>

        {submitError && <ErrorCard message={submitError} onRetry={submit} />}

        {!result && (
          <div className="sticky bottom-0 -mx-4 border-t border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur">
            {submitting ? (
              <Spinner label={t.submitting} />
            ) : (
              <Button className="w-full" disabled={unanswered > 0} onClick={submit}>
                {unanswered > 0 ? t.unanswered(unanswered) : t.submit}
              </Button>
            )}
          </div>
        )}

        {result && (
          <div ref={resultRef} className="scroll-mt-20">
            <Card className="space-y-4 border-stone-300">
              <p className="text-2xl font-bold">{t.score(right, result.quiz.length)}</p>
              <p className={`text-base font-semibold ${result.status === "done" ? "text-emerald-800" : "text-amber-800"}`}>
                {result.status === "done" ? t.passed : t.needsReview}
              </p>
              {result.coming_back.length > 0 && (
                <div className="rounded-xl bg-stone-50 p-3">
                  <p className="text-sm font-bold uppercase tracking-wide text-stone-500">{t.comingBack}</p>
                  <ul className="mt-2 space-y-1">
                    {result.coming_back.map((c) => (
                      <li key={c.concept} className="text-base">
                        “{c.concept}” <span className="text-stone-500">· {formatDate(c.review_due)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Button onClick={nextLesson}>{t.nextLesson}</Button>
                <Button variant="secondary" onClick={() => router.push("/plan")}>
                  {t.toPlan}
                </Button>
              </div>
              <div className="space-y-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-3">
                <p className="text-sm text-amber-900">{t.skipHint}</p>
                <Button variant="secondary" className="w-full" disabled={skipping} onClick={skipToTomorrow}>
                  {skipping ? copy.plan.skipping : t.skipDemo}
                </Button>
              </div>
            </Card>
          </div>
        )}
      </article>
    </Shell>
  );
}
