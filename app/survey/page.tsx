"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Shell } from "@/components/Shell";
import { Button, Chip, ErrorCard, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { MeResponse } from "@/lib/api-types";
import { api, clearDraft, formatDate, loadDraft, saveDraft } from "@/lib/client";
import { copy } from "@/lib/content";
import { addDays } from "@/lib/dates";
import { WEEKDAYS, type Blocker, type Profile, type Weekday } from "@/lib/types";

const s = copy.survey;
const TOTAL = 8;

interface Draft {
  step: number;
  course_title: string;
  goal: string;
  success: string;
  topics: Record<string, "focus" | "skip">;
  minutes: number;
  days: Weekday[];
  /** Index into q6 options, or -1 for a picked date. */
  deadlineChoice: number;
  deadlineDate: string;
  prior: string;
  blocker: Blocker;
  note: string;
}

function initialDraft(me: MeResponse): Draft {
  const p = me.profile;
  const units = me.course?.units ?? [];
  const topics: Draft["topics"] = {};
  for (const u of units) {
    if (p?.focus.includes(u.title)) topics[u.title] = "focus";
    if (p?.skip.includes(u.title)) topics[u.title] = "skip";
  }
  return {
    step: 0,
    course_title: p?.course_title ?? me.course?.title ?? "",
    goal: p?.goal ?? s.q2.options[0],
    success: p?.success ?? s.q3.options[0],
    topics,
    minutes: p?.minutes_per_day ?? 15,
    // All seven days by default, so "skip to tomorrow" always lands on a study day in the demo.
    days: p?.study_days ?? [...WEEKDAYS],
    deadlineChoice: p ? -1 : 0,
    deadlineDate: p?.deadline ?? addDays(me.today, s.q6.options[0].days),
    prior: p?.prior_knowledge ?? s.q7.options[0],
    blocker: p?.blocker ?? "time",
    note: p?.blocker_note ?? "",
  };
}

function toProfile(d: Draft, me: MeResponse): Profile {
  const deadline = d.deadlineChoice >= 0 ? addDays(me.today, s.q6.options[d.deadlineChoice].days) : d.deadlineDate;
  const titled = (v: "focus" | "skip") => Object.entries(d.topics).filter(([, t]) => t === v).map(([title]) => title);
  return {
    course_title: d.course_title,
    goal: d.goal,
    success: d.success,
    focus: titled("focus"),
    skip: titled("skip"),
    minutes_per_day: d.minutes,
    study_days: d.days,
    deadline,
    prior_knowledge: d.prior,
    blocker: d.blocker,
    blocker_note: d.note,
  };
}

function Question({ title, help, children }: { title: string; help?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="text-2xl font-bold leading-snug tracking-tight text-stone-900">{title}</legend>
      {help && <p className="text-base text-stone-600">{help}</p>}
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

/** Single choice from tap targets, plus an optional free-text answer. */
function OneOf({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (v: string) => void }) {
  const custom = options.includes(value) ? "" : value;
  return (
    <>
      <div className="grid gap-2">
        {options.map((o) => (
          <Chip key={o} selected={value === o} onClick={() => onChange(o)}>
            {o}
          </Chip>
        ))}
      </div>
      <input
        type="text"
        value={custom}
        maxLength={300}
        onChange={(e) => onChange(e.target.value || options[0])}
        placeholder={s.otherPlaceholder}
        className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none"
      />
    </>
  );
}

export default function Survey() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["survey", "test"]);
  const [d, setD] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (me && !d) setD(loadDraft<Draft>("survey") ?? initialDraft(me));
  }, [me, d]);

  useEffect(() => {
    if (d) saveDraft("survey", d);
  }, [d]);

  if (gateError) return <Shell><ErrorCard message={gateError} onRetry={reload} /></Shell>;
  if (!me || !d) return <Shell><Spinner /></Shell>;

  const set = (patch: Partial<Draft>) => setD({ ...d, ...patch });
  const units = me.course?.units ?? [];

  async function finish() {
    if (!me || !d) return;
    setSaving(true);
    setError(null);
    const res = await api("/api/profile", { method: "POST", body: { profile: toProfile(d, me) } });
    if (!res.ok) {
      setSaving(false);
      return setError(res.error);
    }
    clearDraft("survey");
    router.push("/test");
  }

  const steps: ReactNode[] = [
    <Question key="q1" title={s.q1.question} help={s.q1.help}>
      <Chip selected onClick={() => set({ course_title: me.course?.title ?? d.course_title })}>
        {me.course?.title ?? d.course_title}
      </Chip>
    </Question>,
    <Question key="q2" title={s.q2.question}>
      <OneOf options={s.q2.options} value={d.goal} onChange={(goal) => set({ goal })} />
    </Question>,
    <Question key="q3" title={s.q3.question}>
      <OneOf options={s.q3.options} value={d.success} onChange={(success) => set({ success })} />
    </Question>,
    <Question key="q4" title={s.q4.question} help={s.q4.help}>
      <div className="grid gap-2">
        {units.map((u) => {
          const t = d.topics[u.title];
          const cycle = () => {
            const topics = { ...d.topics };
            if (!t) topics[u.title] = "focus";
            else if (t === "focus") topics[u.title] = "skip";
            else delete topics[u.title];
            set({ topics });
          };
          return (
            <Chip key={u.unit_id} selected={!!t} tone={t === "skip" ? "skip" : "default"} onClick={cycle} className="flex items-center justify-between gap-3">
              <span>{u.title}</span>
              {t && <span className="shrink-0 text-sm font-semibold no-underline">{t === "focus" ? s.q4.focusLabel : s.q4.skipLabel}</span>}
            </Chip>
          );
        })}
      </div>
    </Question>,
    <Question key="q5" title={s.q5.question}>
      <p className="text-sm font-semibold text-stone-700">{s.q5.minutesLabel}</p>
      <div className="grid grid-cols-4 gap-2">
        {s.q5.minutes.map((m) => (
          <Chip key={m} selected={d.minutes === m} onClick={() => set({ minutes: m })} compact>
            {m}
          </Chip>
        ))}
      </div>
      <p className="pt-2 text-sm font-semibold text-stone-700">{s.q5.daysLabel}</p>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((day) => {
          const on = d.days.includes(day);
          return (
            <Chip
              key={day}
              selected={on}
              compact
              className="text-sm"
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
    </Question>,
    <Question key="q6" title={s.q6.question}>
      <div className="grid gap-2">
        {s.q6.options.map((o, i) => (
          <Chip key={o.label} selected={d.deadlineChoice === i} onClick={() => set({ deadlineChoice: i })} className="flex justify-between gap-3">
            <span>{o.label}</span>
            <span className="text-stone-500">{formatDate(addDays(me.today, o.days), { month: "short", day: "numeric", year: "numeric" })}</span>
          </Chip>
        ))}
      </div>
      <label className="block space-y-2">
        <span className="text-sm font-semibold text-stone-700">{s.q6.pickDate}</span>
        <input
          type="date"
          min={addDays(me.today, 1)}
          value={d.deadlineChoice === -1 ? d.deadlineDate : ""}
          onChange={(e) => e.target.value && set({ deadlineChoice: -1, deadlineDate: e.target.value })}
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-4 text-base focus:border-emerald-700 focus:outline-none"
        />
      </label>
    </Question>,
    <Question key="q7" title={s.q7.question}>
      <OneOf options={s.q7.options} value={d.prior} onChange={(prior) => set({ prior })} />
    </Question>,
    <Question key="q8" title={s.q8.question}>
      <div className="grid gap-2">
        {s.q8.options.map((o) => (
          <Chip key={o.value} selected={d.blocker === o.value} onClick={() => set({ blocker: o.value as Blocker })}>
            {o.label}
          </Chip>
        ))}
      </div>
      <textarea
        value={d.note}
        maxLength={500}
        rows={2}
        onChange={(e) => set({ note: e.target.value })}
        placeholder={s.q8.notePlaceholder}
        className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-base placeholder:text-stone-400 focus:border-emerald-700 focus:outline-none"
      />
    </Question>,
  ];

  const step = Math.min(d.step, TOTAL - 1);
  const last = step === TOTAL - 1;

  return (
    <Shell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-stone-500">{s.stepOf(step + 1, TOTAL)}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-stone-200" aria-hidden>
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${((step + 1) / TOTAL) * 100}%` }} />
          </div>
        </div>

        {steps[step]}

        {error && <ErrorCard message={error} onRetry={finish} />}

        <div className="sticky bottom-0 -mx-4 flex gap-3 border-t border-stone-200 bg-stone-50/95 px-4 py-3 backdrop-blur">
          {step > 0 && (
            <Button variant="secondary" onClick={() => set({ step: step - 1 })} disabled={saving}>
              {s.back}
            </Button>
          )}
          {last ? (
            <Button className="flex-1" onClick={finish} disabled={saving}>
              {saving ? s.saving : s.finish}
            </Button>
          ) : (
            <Button className="flex-1" onClick={() => set({ step: step + 1 })}>
              {s.next}
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}
