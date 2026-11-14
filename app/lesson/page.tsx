"use client";
// Today's lesson: why line, a quick review first (when due), the reading, then a quiz checked one question at a time.
// /lesson?unit=X re-reads a covered unit without changing progress. /lesson?k=KEY reopens a graded lesson.
// The server enforces locking; this page only renders what it is given.
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import { LessonBody } from "@/components/lesson/LessonBody";
import { LockedState } from "@/components/lesson/LockedState";
import { ModeBadges } from "@/components/lesson/ModeBadges";
import { QuestionSequence } from "@/components/lesson/QuestionSequence";
import { ResultCard } from "@/components/lesson/ResultCard";
import { SideChat } from "@/components/lesson/SideChat";
import { SourceQuote } from "@/components/lesson/SourceQuote";
import { QuestionCard } from "@/components/QuestionCard";
import { StatusPill } from "@/components/StatusPill";
import { Button, ErrorCard, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import { WhyLine } from "@/components/WhyLine";
import type {
  AnswersResponse,
  CheckResponse,
  LessonResponse,
  LessonResult,
  PresentedLesson,
  QuestionResult,
  RereadResponse,
  Stage,
} from "@/lib/api-types";
import { api, emitDayChange, onDayChange } from "@/lib/client";
import { lessonCopy as t, lessonsCopy } from "@/lib/copy/pages";

type View =
  | { kind: "loading" }
  | { kind: "lesson"; data: PresentedLesson }
  | { kind: "reread"; data: RereadResponse }
  | { kind: "locked"; message: string }
  | { kind: "error"; message: string; retryable: boolean; limited: boolean };

type Params = { key?: string | null; unit?: string | null };

function readUrl(): Params {
  const p = new URLSearchParams(window.location.search);
  return { key: p.get("k"), unit: p.get("unit") };
}

function setUrl(params: Params) {
  const q = params.key ? `?k=${encodeURIComponent(params.key)}` : params.unit ? `?unit=${encodeURIComponent(params.unit)}` : "";
  window.history.replaceState(null, "", `/lesson${q}`);
}

/** All questions with their feedback, read-only (a graded lesson or a re-read). */
function AnsweredList({ questions, seed, feedback }: { questions: PresentedLesson["lesson"]["quiz"]; seed: string; feedback: Record<string, QuestionResult> }) {
  return (
    <div className="space-y-6">
      {questions.map((q, i) => (
        <QuestionCard key={q.question_id} q={q} number={i + 1} seed={seed} chosen={feedback[q.question_id]?.chosen} feedback={feedback[q.question_id]} disabled />
      ))}
    </div>
  );
}

function LessonHeader({ data }: { data: PresentedLesson }) {
  return (
    <header className="space-y-3">
      <ModeBadges mode={data.order.mode} minutes={data.order.minutes} />
      <h1 className="text-h1 text-ink">{data.lesson.title}</h1>
      <WhyLine text={data.order.why} />
    </header>
  );
}

export default function LessonPage() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["lesson", "done"]);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [checked, setChecked] = useState<Record<string, QuestionResult>>({});
  const [result, setResult] = useState<LessonResult | null>(null);
  const [stage, setStage] = useState<Stage | null>(null);
  const [started, setStarted] = useState(false);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewHint, setReviewHint] = useState(false);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);
  const loadedOnce = useRef(false);
  const reviewRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (params: Params): Promise<void> => {
      setView({ kind: "loading" });
      setGradeError(null);
      setReviewHint(false);
      const path = params.key
        ? `/api/lesson?key=${encodeURIComponent(params.key)}`
        : params.unit
          ? `/api/lesson?unit=${encodeURIComponent(params.unit)}`
          : "/api/lesson";
      const res = await api<LessonResponse>(path);
      if (!res.ok) {
        if (res.code === "locked") return setView({ kind: "locked", message: res.error });
        if (res.code === "stale" || (res.status === 404 && (params.key || params.unit))) {
          setUrl({});
          return load({});
        }
        const limited = res.code === "rate_limited";
        return setView({ kind: "error", message: res.error, retryable: !limited, limited });
      }
      const data = res.data;
      if ("finished" in data) return router.replace("/done");
      if ("reread" in data) return setView({ kind: "reread", data });
      const quizIds = new Set(data.lesson.quiz.map((q) => q.question_id));
      setChecked(data.checked);
      setResult(data.result);
      setStarted(!!data.result || Object.keys(data.checked).some((id) => quizIds.has(id)));
      setReviewDone(data.lesson.review_quiz.every((q) => q.question_id in data.checked));
      setView({ kind: "lesson", data });
    },
    [router],
  );

  useEffect(() => {
    if (!me || loadedOnce.current) return;
    loadedOnce.current = true;
    void load(readUrl());
  }, [me, load]);

  // The demo clock moved (calendar popover or the shortcut below): show the lesson that is open now.
  useEffect(
    () =>
      onDayChange(() => {
        const { unit } = readUrl();
        const params = unit ? { unit } : {};
        setUrl(params);
        void load(params);
      }),
    [load],
  );

  async function check(questionId: string, choice: number): Promise<string | null> {
    if (view.kind !== "lesson") return null;
    const res = await api<CheckResponse>("/api/answers/check", {
      method: "POST",
      body: { lesson_key: view.data.lesson_key, question_id: questionId, choice },
    });
    if (!res.ok) {
      if (res.code === "locked" || res.code === "stale") {
        void load({});
        return null;
      }
      return res.error;
    }
    setChecked((prev) => ({ ...prev, [questionId]: res.data.feedback }));
    return null;
  }

  async function grade() {
    if (view.kind !== "lesson") return;
    const missingReview = view.data.lesson.review_quiz.some((q) => !(q.question_id in checked));
    if (missingReview) {
      setReviewHint(true);
      reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    setGrading(true);
    setGradeError(null);
    const res = await api<AnswersResponse>("/api/answers", { method: "POST", body: { lesson_key: view.data.lesson_key } });
    setGrading(false);
    if (!res.ok) {
      if (res.code === "locked" || res.code === "stale") return void load({});
      return setGradeError(res.error);
    }
    setResult(res.data.result);
    setStage(res.data.stage);
    setChecked(Object.fromEntries([...res.data.result.quiz, ...res.data.result.review_quiz].map((r) => [r.question_id, r])));
    setUrl({ key: view.data.lesson_key });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  function nextLesson() {
    if (stage === "done") return router.push("/done");
    setUrl({});
    window.scrollTo({ top: 0 });
    void load({});
  }

  async function skipToTomorrow() {
    setSkipping(true);
    const res = await api("/api/demo/skip-day", { method: "POST" });
    setSkipping(false);
    if (!res.ok) return setGradeError(res.error);
    window.scrollTo({ top: 0 });
    emitDayChange(); // reloads this page (open lesson) and the shell
  }

  const shell = (children: React.ReactNode, title: string = t.title) => (
    <AppShell me={me} title={title}>
      <div className="mx-auto max-w-reading space-y-6 pb-24">{children}</div>
    </AppShell>
  );

  if (gateError) return shell(<ErrorCard message={gateError} onRetry={reload} />);

  if (view.kind === "loading") {
    return shell(
      <>
        <Spinner label={t.writing} />
        <div className="space-y-4" aria-hidden>
          <div className="skeleton h-7 w-40" />
          <div className="skeleton h-9 w-3/4" />
          <div className="skeleton h-20 w-full rounded-card" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-11/12" />
          <div className="skeleton h-4 w-4/5" />
        </div>
      </>,
    );
  }

  if (view.kind === "locked") return shell(<LockedState message={view.message} />);

  if (view.kind === "error") {
    return shell(
      <>
        {view.limited && <h1 className="text-h2 text-ink">{t.limitTitle}</h1>}
        <ErrorCard message={view.message} onRetry={() => load(readUrl())} retryable={view.retryable} />
        {view.limited && (
          <Button variant="secondary" onClick={() => router.push("/")}>
            {t.backToPlan}
          </Button>
        )}
      </>,
    );
  }

  if (view.kind === "reread") {
    const { data } = view;
    const past = data.lesson;
    return shell(
      <>
        <p className="flex items-start gap-2 rounded-control bg-info-soft p-3 text-body text-info" role="status">
          <Icon name="info" className="mt-0.5 size-5" />
          {t.rereadBanner}
        </p>
        <header className="space-y-3">
          <StatusPill state={data.state} />
          <h1 className="text-h1 text-ink">{data.unit.title}</h1>
          <p className="text-body text-ink-muted">{data.unit.objective}</p>
        </header>
        {past ? (
          <>
            <LessonBody lesson={past.lesson} />
            <section className="space-y-4" aria-labelledby="past-quiz">
              <h2 id="past-quiz" className="text-h2 text-ink">
                {t.quizTitle(past.lesson.quiz.length)}
              </h2>
              <AnsweredList questions={past.lesson.quiz} seed={past.lesson_key} feedback={past.checked} />
            </section>
          </>
        ) : (
          <SourceQuote quote={data.unit.excerpt} label={t.rereadExcerpt} />
        )}
        <Button variant="secondary" onClick={() => router.push("/lessons")}>
          <Icon name="chevron-left" />
          {t.rereadBack}
        </Button>
      </>,
      lessonsCopy.title,
    );
  }

  const { data } = view;
  const seed = data.lesson_key;
  const review = data.lesson.review_quiz;
  const reviewRight = review.filter((q) => checked[q.question_id]?.correct).length;

  return shell(
    <>
      <LessonHeader data={data} />

      {review.length > 0 && (
        <section ref={reviewRef} aria-labelledby="review-title" className="scroll-mt-20 space-y-4 rounded-card border border-warn-line bg-surface p-5 shadow-card md:p-6">
          <h2 id="review-title" className="flex items-center gap-2 text-h2 text-ink">
            <Icon name="refresh" className="size-5 text-warn" />
            {reviewDone || result ? t.reviewSummary(reviewRight, review.length) : t.reviewTitle(review.length)}
          </h2>
          {reviewHint && !reviewDone && (
            <p role="alert" className="text-small text-warn">
              {t.reviewFirst}
            </p>
          )}
          {result ? (
            <AnsweredList questions={review} seed={seed} feedback={checked} />
          ) : (
            !reviewDone && (
              <QuestionSequence
                key={`${seed}:review`}
                questions={review}
                seed={seed}
                checked={checked}
                onCheck={check}
                onDone={() => setReviewDone(true)}
                doneLabel={t.next}
                holdLast={false}
              />
            )
          )}
        </section>
      )}

      <LessonBody lesson={data.lesson} />

      {!started && !result && (
        <Button className="h-12 w-full" onClick={() => setStarted(true)}>
          {t.readDone}
        </Button>
      )}

      {(started || result) && (
        <section aria-labelledby="quiz-title" className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card md:p-6">
          <h2 id="quiz-title" className="text-h2 text-ink">
            {t.quizTitle(data.lesson.quiz.length)}
          </h2>
          {result ? (
            <AnsweredList questions={data.lesson.quiz} seed={seed} feedback={checked} />
          ) : (
            <QuestionSequence
              key={`${seed}:quiz`}
              questions={data.lesson.quiz}
              seed={seed}
              checked={checked}
              onCheck={check}
              onDone={grade}
              doneLabel={grading ? t.grading : t.seeResult}
              holdLast
              busy={grading}
            />
          )}
          {gradeError && <ErrorCard message={gradeError} onRetry={grade} />}
        </section>
      )}

      {result && (
        <div ref={resultRef} className="scroll-mt-20">
          <ResultCard result={result} onNext={nextLesson} onPlan={() => router.push("/")} onSkip={skipToTomorrow} skipping={skipping} />
        </div>
      )}

      {me?.ai === "real" && <SideChat lessonKey={data.lesson_key} />}
    </>,
  );
}
