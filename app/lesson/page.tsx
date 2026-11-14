"use client";
// Today's lesson: the time chooser at the start of a day's session, then the why line, a quick review first
// (when due), the reading, and a quiz checked one question at a time.
// /lesson?unit=X re-reads a covered unit without changing progress. /lesson?k=KEY reopens a graded lesson.
// The page follows its URL: a link or a search result that leads from one of these to another loads it.
// The server enforces locking; this page only renders what it is given.
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import { LessonBody } from "@/components/lesson/LessonBody";
import { LockedState } from "@/components/lesson/LockedState";
import { MinutesChooser } from "@/components/lesson/MinutesChooser";
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
  SessionResponse,
  Stage,
} from "@/lib/api-types";
import { api, emitDayChange, onDayChange } from "@/lib/client";
import { copy } from "@/lib/content";
import { lessonCopy as t, lessonsCopy } from "@/lib/copy/pages";

type Params = { key?: string | null; unit?: string | null };

type View =
  | { kind: "loading" }
  | { kind: "choose"; session: SessionResponse; params: Params }
  | { kind: "lesson"; data: PresentedLesson }
  | { kind: "reread"; data: RereadResponse }
  | { kind: "locked"; message: string }
  | { kind: "error"; message: string; retryable: boolean; limited: boolean };

function readUrl(): Params {
  const p = new URLSearchParams(window.location.search);
  return { key: p.get("k") ?? p.get("key"), unit: p.get("unit") };
}

/** One string per thing the page can show: a lesson by key, a unit, or today's lesson. */
function signature(params: Params): string {
  return params.key ? `k:${params.key}` : params.unit ? `unit:${params.unit}` : "today";
}

function LessonSkeleton() {
  return (
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
    </>
  );
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

function LessonHeader({ data, sessionLabel }: { data: PresentedLesson; sessionLabel: string | null }) {
  return (
    <header className="space-y-3">
      {sessionLabel && <p className="text-small font-semibold text-ink-muted">{sessionLabel}</p>}
      <ModeBadges mode={data.order.mode} minutes={data.order.minutes} />
      <h1 className="text-h1 text-ink">{data.lesson.title}</h1>
      <WhyLine text={data.order.why} />
    </header>
  );
}

/** The page reads the query string, so it renders inside a Suspense boundary (required for a prerendered page). */
export default function LessonPage() {
  return (
    <Suspense
      fallback={
        <AppShell me={null} title={t.title}>
          <div className="mx-auto max-w-reading space-y-6 pb-24">
            <LessonSkeleton />
          </div>
        </AppShell>
      }
    >
      <LessonView />
    </Suspense>
  );
}

function LessonView() {
  const router = useRouter();
  const search = useSearchParams();
  const urlKey = search.get("k") ?? search.get("key");
  const urlUnit = search.get("unit");
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
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [chooseError, setChooseError] = useState<string | null>(null);
  /** What the page is showing or loading, as a signature of its URL. Null before the first load. */
  const shown = useRef<string | null>(null);
  const reviewRef = useRef<HTMLElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  /** Puts the address bar in step with what the page shows, without loading anything. */
  const setUrl = useCallback((params: Params) => {
    shown.current = signature(params);
    const q = params.key ? `?k=${encodeURIComponent(params.key)}` : params.unit ? `?unit=${encodeURIComponent(params.unit)}` : "";
    window.history.replaceState(null, "", `/lesson${q}`);
  }, []);

  const load = useCallback(
    async (params: Params): Promise<void> => {
      shown.current = signature(params);
      setView({ kind: "loading" });
      setGradeError(null);
      setReviewHint(false);
      // A day's session starts with one question: how much time is there today? The server says when to ask.
      // If this request fails, the lesson request below reports the real error.
      const s = await api<SessionResponse>("/api/session");
      setSession(s.ok ? s.data : null);
      if (s.ok && s.data.ask && !params.key && (!params.unit || params.unit === s.data.open_unit_id)) {
        setChooseError(null);
        return setView({ kind: "choose", session: s.data, params });
      }
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
    [router, setUrl],
  );

  // Follow the URL: the first load, and every later navigation to another /lesson address
  // (the Locked screen's link, a search result, the browser's back button).
  useEffect(() => {
    if (!me) return;
    const params: Params = { key: urlKey, unit: urlUnit };
    if (shown.current === signature(params)) return;
    window.scrollTo({ top: 0 });
    void load(params);
  }, [me, urlKey, urlUnit, load]);

  // The demo clock moved (calendar popover or the shortcut below): show the lesson that is open now.
  useEffect(
    () =>
      onDayChange(() => {
        const { unit } = readUrl();
        const params = unit ? { unit } : {};
        setUrl(params);
        void load(params);
      }),
    [load, setUrl],
  );

  async function choose(minutes: number) {
    if (view.kind !== "choose") return;
    setChoosing(true);
    setChooseError(null);
    const res = await api<SessionResponse>("/api/session", { method: "POST", body: { minutes } });
    setChoosing(false);
    if (!res.ok) return setChooseError(res.error);
    void load(view.params);
  }

  async function check(questionId: string, choice: number): Promise<string | null> {
    if (view.kind !== "lesson") return null;
    const res = await api<CheckResponse>("/api/answers/check", {
      method: "POST",
      body: { lesson_key: view.data.lesson_key, question_id: questionId, choice },
    });
    if (!res.ok) {
      if (res.code === "locked" || res.code === "stale") {
        setUrl({});
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
    if (!res.ok) {
      setGrading(false);
      if (res.code === "locked" || res.code === "stale") {
        setUrl({});
        return void load({});
      }
      return setGradeError(res.error);
    }
    // Today's session may hold a second lesson; the result card needs the fresh count.
    const s = await api<SessionResponse>("/api/session");
    if (s.ok) setSession(s.data);
    setGrading(false);
    setResult(res.data.result);
    setStage(res.data.stage);
    setChecked(Object.fromEntries([...res.data.result.quiz, ...res.data.result.review_quiz].map((r) => [r.question_id, r])));
    setUrl({ key: view.data.lesson_key });
    setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  // No lesson is open any more: the one just graded was the last topic of the course.
  const finished = stage === "done" || (session !== null && session.open_unit_id === null);

  function nextLesson() {
    if (finished) return router.push("/done");
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

  if (view.kind === "loading") return shell(<LessonSkeleton />);

  if (view.kind === "choose") {
    return shell(<MinutesChooser session={view.session} busy={choosing} error={chooseError} onStart={choose} />);
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
  // A session of 25 minutes or more is two short lessons: say which one this is, and lead into the second.
  const split = session !== null && session.lessons_in_session === 2;
  const sessionLabel =
    split && !result && session.lessons_done_today < session.lessons_in_session
      ? copy.session.lessonOf(session.lessons_done_today + 1, session.lessons_in_session)
      : null;
  const more =
    split && result && !finished && session.lessons_done_today === 1
      ? { done: 1, total: session.lessons_in_session }
      : undefined;

  return shell(
    <>
      <LessonHeader data={data} sessionLabel={sessionLabel} />

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
          <ResultCard
            result={result}
            more={more}
            finished={finished}
            onNext={nextLesson}
            onPlan={() => router.push("/")}
            onSkip={skipToTomorrow}
            skipping={skipping}
          />
        </div>
      )}

      {me?.ai === "real" && <SideChat lessonKey={data.lesson_key} />}
    </>,
  );
}
