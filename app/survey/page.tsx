"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, Chip, ErrorCard, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { MeResponse } from "@/lib/api-types";
import { api, clearDraft, loadDraft, saveDraft } from "@/lib/client";
import { copy } from "@/lib/content";
import { sourceCopy } from "@/lib/copy/pages";
import { addDays, isIsoDate, shortDate } from "@/lib/dates";
import { WEEKDAYS, type Blocker, type Profile, type Weekday } from "@/lib/types";

const s = copy.survey;
const TOTAL = 8;

interface Draft {
  step: number;
  goal: string;
  success: string;
  focus: string[];
  skip: string[];
  minutes: number;
  days: Weekday[];
  /** Index into q6 options, or -1 for a picked date. */
  deadlineChoice: number;
  deadlineDate: string;
  prior: string;
  blocker: Blocker;
  note: string;
}

/** The learner's own course (not the sample): question 1 shows its title and questions 2, 3 and 7 drop the PMP wording. */
const isOwn = (me: MeResponse) => me.sample === null && !!me.course;

/** Questions 2, 3 and 7 as worded for this learner's course. */
function wording(me: MeResponse) {
  return isOwn(me) ? s.own : { q2: s.q2, q3: s.q3, q7: s.q7 };
}

/** A saved draft may hold answers written for the other course; anything that is not an option here goes back to the first one. */
function fitted(d: Draft, me: MeResponse): Draft {
  const w = wording(me);
  const pick = (value: string, options: readonly { value: string }[]) => (options.some((o) => o.value === value) ? value : options[0].value);
  return { ...d, goal: pick(d.goal, w.q2.options), success: pick(d.success, w.q3.options), prior: pick(d.prior, w.q7.options) };
}

/** The ★ answers from COPY.md (study days: all seven, so "skip to tomorrow" always lands on a study day). */
function exampleDraft(me: MeResponse): Draft {
  const w = wording(me);
  return {
    step: 0,
    goal: w.q2.options[0].value,
    success: w.q3.options[0].value,
    focus: [],
    skip: [],
    minutes: 15,
    days: [...WEEKDAYS],
    deadlineChoice: 0,
    deadlineDate: addDays(me.today, s.q6.options[0].days),
    prior: w.q7.options[0].value,
    blocker: "time",
    note: s.q8.notes.time[0],
  };
}

function initialDraft(me: MeResponse): Draft {
  const p = me.profile;
  if (!p) return exampleDraft(me);
  return {
    step: 0,
    goal: p.goal,
    success: p.success,
    focus: p.focus,
    skip: p.skip,
    minutes: p.minutes_per_day,
    days: p.study_days,
    deadlineChoice: -1,
    deadlineDate: p.deadline,
    prior: p.prior_knowledge,
    blocker: p.blocker,
    note: p.blocker_note,
  };
}

function deadlineOf(d: Draft, me: MeResponse): string {
  return d.deadlineChoice >= 0 ? addDays(me.today, s.q6.options[d.deadlineChoice].days) : d.deadlineDate;
}

function toProfile(d: Draft, me: MeResponse): Profile {
  return {
    // The learner's own course keeps the title its plan was given; the sample keeps the one from COPY.md.
    course_title: isOwn(me) && me.course ? me.course.title : s.q1.options[0].value,
    goal: d.goal,
    success: d.success,
    focus: d.focus,
    skip: d.skip,
    minutes_per_day: d.minutes,
    study_days: d.days,
    deadline: deadlineOf(d, me),
    prior_knowledge: d.prior,
    blocker: d.blocker,
    blocker_note: d.note,
  };
}

function Question({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="text-h1 text-ink">{title}</legend>
      {help && <p className="-mt-2 text-body text-ink-muted">{help}</p>}
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function OneOf({ options, value, onChange }: { options: readonly { label: string; value: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <Chip key={o.value} selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </Chip>
      ))}
    </div>
  );
}

function RowLabel({ children }: { children: ReactNode }) {
  return <p className="pt-1 text-small font-semibold text-ink">{children}</p>;
}

export default function Survey() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["survey", "test"]);
  const [d, setD] = useState<Draft | null>(null);
  const [saving, setSaving] = useState<"finish" | "example" | null>(null);
  const [error, setError] = useState<{ message: string; retryable: boolean } | null>(null);
  const [pickOne, setPickOne] = useState(false);

  useEffect(() => {
    if (!me || d) return;
    const draft = fitted(loadDraft<Draft>("survey") ?? initialDraft(me), me);
    // /survey?q=4 opens at that question (the finish page's "Choose topics again").
    const asked = Number(new URLSearchParams(window.location.search).get("q"));
    setD(asked >= 1 && asked <= TOTAL ? { ...draft, step: asked - 1 } : draft);
  }, [me, d]);

  useEffect(() => {
    if (d) saveDraft("survey", d);
  }, [d]);

  if (gateError) {
    return (
      <AppShell me={null} variant="flow">
        <ErrorCard message={gateError} onRetry={reload} />
      </AppShell>
    );
  }
  if (!me || !d) {
    return (
      <AppShell me={me} variant="flow">
        <Spinner />
      </AppShell>
    );
  }

  const set = (patch: Partial<Draft>) => {
    setPickOne(false);
    setError(null);
    setD({ ...d, ...patch });
  };
  const units = me.course?.units ?? [];
  const w = wording(me);

  async function save(draft: Draft, kind: "finish" | "example") {
    if (!me) return;
    setSaving(kind);
    setError(null);
    const res = await api("/api/profile", { method: "POST", body: { profile: toProfile(draft, me) } });
    if (!res.ok) {
      setSaving(null);
      // The server refused the date (the day changed, or an old draft): go back to that question.
      if (res.code === "bad_deadline") {
        setD({ ...draft, step: 5 });
        return setPickOne(true);
      }
      // Sending the same answers again cannot fix an answer the server refused, so only other failures get "Try again".
      return setError({ message: res.error, retryable: res.status !== 400 });
    }
    clearDraft("survey");
    router.push("/test");
  }

  const step = Math.min(d.step, TOTAL - 1);
  const last = step === TOTAL - 1;
  const dateOk = d.deadlineChoice >= 0 || (isIsoDate(d.deadlineDate) && d.deadlineDate > me.today);
  const stepValid = step !== 5 || dateOk;
  const dateProblem = step === 5 && pickOne && !dateOk ? (d.deadlineDate ? s.q6.afterToday : s.pickOne) : null;

  function next() {
    if (!d) return;
    if (!stepValid) return setPickOne(true);
    if (last) return void save(d, "finish");
    set({ step: step + 1 });
  }

  const toggleTopic = (title: string, row: "focus" | "skip") => {
    const other = row === "focus" ? "skip" : "focus";
    const inRow = d[row].includes(title);
    set({
      [row]: inRow ? d[row].filter((t) => t !== title) : [...d[row], title],
      [other]: d[other].filter((t) => t !== title),
    } as Partial<Draft>);
  };

  const steps: ReactNode[] = [
    <Question key="q1" title={s.q1.question} help={isOwn(me) ? sourceCopy(me.course?.source).note : undefined}>
      <Chip selected onClick={() => undefined}>
        {isOwn(me) && me.course ? me.course.title : s.q1.options[0].label}
      </Chip>
    </Question>,
    <Question key="q2" title={w.q2.question}>
      <OneOf options={w.q2.options} value={d.goal} onChange={(goal) => set({ goal })} />
    </Question>,
    <Question key="q3" title={w.q3.question}>
      <OneOf options={w.q3.options} value={d.success} onChange={(success) => set({ success })} />
    </Question>,
    <Question key="q4" title={s.q4.question} help={s.q4.help}>
      <RowLabel>{s.q4.focusLabel}</RowLabel>
      <div className="flex flex-wrap gap-2">
        {units.map((u) => (
          <Chip key={`f-${u.unit_id}`} selected={d.focus.includes(u.title)} onClick={() => toggleTopic(u.title, "focus")}>
            {u.title}
          </Chip>
        ))}
      </div>
      <RowLabel>{s.q4.skipLabel}</RowLabel>
      <div className="flex flex-wrap gap-2">
        {units.map((u) => (
          <Chip key={`s-${u.unit_id}`} tone="skip" selected={d.skip.includes(u.title)} onClick={() => toggleTopic(u.title, "skip")}>
            {u.title}
          </Chip>
        ))}
      </div>
    </Question>,
    <Question key="q5" title={s.q5.question}>
      <RowLabel>{s.q5.minutesLabel}</RowLabel>
      <div className="grid grid-cols-4 gap-2">
        {s.q5.minutes.map((m) => (
          <Chip key={m} compact selected={d.minutes === m} onClick={() => set({ minutes: m })}>
            {m}
          </Chip>
        ))}
      </div>
      <RowLabel>{s.q5.daysLabel}</RowLabel>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => {
          const on = d.days.includes(day);
          return (
            <Chip
              key={day}
              compact
              className="text-small"
              selected={on}
              onClick={() => {
                const days = on ? d.days.filter((x) => x !== day) : WEEKDAYS.filter((x) => x === day || d.days.includes(x));
                if (days.length > 0) set({ days });
              }}
            >
              {s.days[day]}
            </Chip>
          );
        })}
      </div>
      <p className="text-small text-ink-muted">{s.q5.note}</p>
    </Question>,
    <Question key="q6" title={s.q6.question}>
      <div className="grid gap-2">
        {s.q6.options.map((o, i) => (
          <Chip key={o.label} selected={d.deadlineChoice === i} onClick={() => set({ deadlineChoice: i })}>
            <span className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span>{o.label}</span>
              <span className="text-small text-ink-muted">{o.note || shortDate(addDays(me.today, o.days))}</span>
            </span>
          </Chip>
        ))}
      </div>
      <label className="block space-y-2 pt-1">
        <span className="text-small font-semibold text-ink">{s.q6.pickDate}</span>
        <input
          type="date"
          min={addDays(me.today, 1)}
          value={d.deadlineChoice === -1 ? d.deadlineDate : ""}
          onChange={(e) => set({ deadlineChoice: -1, deadlineDate: e.target.value })}
          aria-invalid={dateProblem ? true : undefined}
          aria-describedby={dateProblem ? "exam-date-problem" : undefined}
          className={`min-h-tap w-full rounded-control border bg-surface px-4 text-body text-ink ${dateProblem ? "border-danger ring-1 ring-danger ring-inset" : d.deadlineChoice === -1 ? "border-primary ring-1 ring-primary ring-inset" : "border-line-strong"}`}
        />
      </label>
      {dateProblem && (
        <p id="exam-date-problem" role="alert" className="text-small font-semibold text-danger">
          {dateProblem}
        </p>
      )}
    </Question>,
    <Question key="q7" title={w.q7.question}>
      <OneOf options={w.q7.options} value={d.prior} onChange={(prior) => set({ prior })} />
    </Question>,
    <Question key="q8" title={s.q8.question}>
      <div className="grid gap-2">
        {s.q8.options.map((o) => (
          <Chip
            key={o.value}
            selected={d.blocker === o.value}
            onClick={() => set({ blocker: o.value as Blocker, note: o.value === d.blocker ? d.note : "" })}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      {s.q8.notes[d.blocker].length > 0 && (
        <>
          <RowLabel>
            {s.q8.noteLabel} <span className="font-normal text-ink-muted">{s.q8.noteOptional}</span>
          </RowLabel>
          <div className="flex flex-wrap gap-2">
            {s.q8.notes[d.blocker].map((n) => (
              <Chip key={n} selected={d.note === n} onClick={() => set({ note: d.note === n ? "" : n })}>
                {n}
              </Chip>
            ))}
          </div>
        </>
      )}
    </Question>,
  ];

  return (
    <AppShell me={me} variant="flow">
      <div className="mx-auto max-w-reading space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-small font-semibold text-ink-muted">{s.progress(step + 1, TOTAL)}</p>
            <Button
              variant="ghost"
              className="-mr-3 px-3 text-small"
              busy={saving === "example"}
              busyLabel={s.fillingExample}
              disabled={saving !== null}
              onClick={() => void save({ ...exampleDraft(me), step: TOTAL - 1 }, "example")}
            >
              {s.fillExample}
            </Button>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
            <div className="h-full rounded-full bg-ink transition-all" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
          </div>
        </div>

        {steps[step]}

        {pickOne && !dateProblem && (
          <p role="alert" className="text-small font-semibold text-danger">
            {s.pickOne}
          </p>
        )}
        {error && <ErrorCard message={error.message} retryable={error.retryable} onRetry={() => void save(d, "finish")} />}

        <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
          {step > 0 && (
            <Button variant="secondary" onClick={() => set({ step: step - 1 })} disabled={saving !== null}>
              {s.back}
            </Button>
          )}
          <Button className="flex-1" onClick={next} busy={saving === "finish"} busyLabel={s.saving} disabled={saving !== null}>
            {last ? s.finish : s.next}
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
