"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { StatusPill } from "@/components/StatusPill";
import { PaceLine } from "@/components/shell/PaceLine";
import { Button, Card, ErrorCard, Pill, Skeleton } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { PlanResponse, PublicQuestion } from "@/lib/api-types";
import { api, clearDraft, clientKey, loadDraft, saveDraft, shuffledIndexes } from "@/lib/client";
import { copy } from "@/lib/content";
import { testTitle } from "@/lib/copy/pages";
import { shortDate } from "@/lib/dates";
import { WEEKDAYS, type Weekday } from "@/lib/types";

const t = copy.test;

interface Draft {
  step: number;
  answers: Record<string, number>;
}

function Options({ q, chosen, onChoose }: { q: PublicQuestion; chosen: number | undefined; onChoose: (i: number) => void }) {
  const order = useMemo(() => shuffledIndexes(q.options.length, `${clientKey()}:${q.question_id}`), [q.options.length, q.question_id]);
  return (
    <div className="grid gap-2">
      {order.map((orig) => {
        const selected = chosen === orig;
        return (
          <button
            key={orig}
            type="button"
            aria-pressed={selected}
            onClick={() => onChoose(orig)}
            className={`flex min-h-tap items-start gap-3 rounded-control border px-4 py-3 text-left text-body transition-colors duration-150 ${selected ? "border-primary bg-surface-muted text-ink ring-1 ring-primary ring-inset" : "border-line bg-surface text-ink hover:border-line-strong"}`}
          >
            <span className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full border-2 ${selected ? "border-ink" : "border-line-strong"}`} aria-hidden>
              {selected && <span className="size-2 rounded-full bg-ink" />}
            </span>
            <span className="flex-1">{q.options[orig]}</span>
          </button>
        );
      })}
    </div>
  );
}

function PlanScreen({ plan, studyDays: chosen, onStart }: { plan: PlanResponse; studyDays: Weekday[]; onStart: () => void }) {
  const known = plan.units.filter((u) => u.status === "known").length;
  const picked = WEEKDAYS.filter((d) => chosen.includes(d));
  const studyDays = picked.length === WEEKDAYS.length ? null : picked.map((d) => copy.survey.days[d]).join(", ");
  const knownLine = t.known(known, plan.units_total);
  const lessonsLine = t.lessons(plan.pace.lessons_left, plan.lesson_minutes, studyDays);
  return (
    <div className="mx-auto max-w-reading space-y-6">
      <h1 className="text-h1 text-ink">{t.planTitle(shortDate(plan.deadline))}</h1>
      <div className="space-y-2 text-body-lg text-ink">
        {known > 0 ? (
          <p>
            {knownLine.before}
            <strong className="font-semibold">{knownLine.strong}</strong>
            {knownLine.after}
          </p>
        ) : (
          <p>{t.knownNone}</p>
        )}
        {plan.pace.lessons_left === 0 ? (
          <p>{t.allKnown}</p>
        ) : (
          <p>
            <strong className="font-semibold">{lessonsLine.strong}</strong>
            {lessonsLine.after}
          </p>
        )}
      </div>
      <Card>
        <PaceLine pace={plan.pace} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-h2 text-ink">{t.topics}</h2>
        <ul className="divide-y divide-line">
          {plan.units.map((u) => (
            <li key={u.unit_id} className="flex items-center justify-between gap-3 py-3">
              <span className="text-body text-ink">{u.title}</span>
              {u.status === "known" ? <StatusPill state="known" label={t.knownPill} /> : <Pill icon="clock" label={t.todoPill} />}
            </li>
          ))}
        </ul>
      </Card>
      <Button className="h-12 w-full" onClick={onStart}>
        {plan.pace.lessons_left === 0 ? t.finishLine : t.start}
      </Button>
    </div>
  );
}

export default function PlacementTest() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["test"]);
  const [questions, setQuestions] = useState<PublicQuestion[] | null>(null);
  const [draft, setDraft] = useState<Draft>({ step: 0, answers: {} });
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);

  async function load() {
    setError(null);
    const res = await api<{ questions: PublicQuestion[] }>("/api/placement");
    if (!res.ok) return setError({ message: res.error, retry: load });
    setQuestions(res.data.questions);
    // Every tested topic was skipped in the survey: nothing to ask, go straight to the plan.
    if (res.data.questions.length === 0) return void submit();
    setDraft(loadDraft<Draft>("placement") ?? { step: 0, answers: {} });
  }

  useEffect(() => {
    if (me) void load();
  }, [me]);

  function update(next: Draft) {
    setDraft(next);
    saveDraft("placement", next);
  }

  async function loadPlan() {
    setError(null);
    const res = await api<PlanResponse>("/api/plan");
    if (!res.ok) return setError({ message: res.error, retry: loadPlan });
    setPlan(res.data);
  }

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await api("/api/placement", { method: "POST", body: { answers: draft.answers } });
    if (!res.ok) {
      setBusy(false);
      return setError({ message: res.error, retry: submit });
    }
    clearDraft("placement");
    await loadPlan();
    setBusy(false);
    window.scrollTo({ top: 0 });
  }

  if (gateError) {
    return (
      <AppShell me={null} variant="flow">
        <ErrorCard message={gateError} onRetry={reload} />
      </AppShell>
    );
  }

  if (plan) {
    return (
      <AppShell me={me} variant="flow">
        <PlanScreen plan={plan} studyDays={me?.profile?.study_days ?? [...WEEKDAYS]} onStart={() => router.push("/lesson")} />
      </AppShell>
    );
  }

  const total = questions?.length ?? 5;
  const step = Math.min(draft.step, total - 1);
  const q = questions?.[step];
  const chosen = q ? draft.answers[q.question_id] : undefined;
  const last = step === total - 1;

  return (
    <AppShell me={me} variant="flow">
      <div className="mx-auto max-w-reading space-y-6">
        <div className="space-y-2">
          <h1 className="text-h1 text-ink">{testTitle(questions && questions.length > 0 ? questions.length : null)}</h1>
          <p className="text-body text-ink-muted">{t.sub}</p>
        </div>

        {error && <ErrorCard message={error.message} onRetry={error.retry} />}

        {!questions && !error && (
          <Card>
            <Skeleton lines={5} />
          </Card>
        )}

        {q && (
          <>
            <div className="space-y-2">
              <p className="text-small font-semibold text-ink-muted">{t.progress(step + 1, total)}</p>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${((step + 1) / total) * 100}%` }} />
              </div>
            </div>
            <fieldset key={q.question_id} className="space-y-4">
              <legend className="text-h2 text-ink">{q.prompt}</legend>
              <Options q={q} chosen={chosen} onChoose={(i) => update({ ...draft, answers: { ...draft.answers, [q.question_id]: i } })} />
              <p className="text-small text-ink-muted">{t.hint}</p>
            </fieldset>

            <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
              {step > 0 && (
                <Button variant="secondary" disabled={busy} onClick={() => update({ ...draft, step: step - 1 })}>
                  {t.back}
                </Button>
              )}
              <Button
                className="flex-1"
                disabled={chosen === undefined}
                busy={busy}
                busyLabel={t.submitting}
                onClick={() => (last ? void submit() : update({ ...draft, step: step + 1 }))}
              >
                {last ? t.submit : t.next}
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
