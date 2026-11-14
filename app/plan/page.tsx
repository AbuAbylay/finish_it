"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Button, Card, ErrorCard, Skeleton, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { CalendarDay, PlanResponse, ReminderResponse, ReminderType } from "@/lib/api-types";
import { api, formatDate } from "@/lib/client";
import { copy } from "@/lib/content";
import type { UnitStatus } from "@/lib/types";

const p = copy.plan;

const DAY_STYLE: Record<CalendarDay["status"], string> = {
  done: "bg-emerald-600 text-white",
  missed: "bg-rose-100 text-rose-800",
  planned: "bg-white text-stone-800 border border-stone-300",
  rest: "bg-transparent text-stone-400",
};

const STATUS_STYLE: Record<UnitStatus, string> = {
  todo: "bg-stone-100 text-stone-700",
  known: "bg-sky-100 text-sky-900",
  done: "bg-emerald-100 text-emerald-900",
  needs_review: "bg-amber-100 text-amber-900",
};

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-xl bg-stone-50 p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs font-semibold text-stone-500">{label}</p>
    </div>
  );
}

function Calendar({ days }: { days: CalendarDay[] }) {
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-stone-500">
        {Object.values(copy.survey.days).map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => (
          <div
            key={d.date}
            title={`${formatDate(d.date)}: ${p.legend[d.status]}`}
            className={`relative grid aspect-square place-items-center rounded-lg text-sm font-semibold ${DAY_STYLE[d.status]} ${d.is_today ? "ring-2 ring-stone-900 ring-offset-1" : ""}`}
          >
            {Number(d.date.slice(8))}
            {d.is_deadline && <span className="absolute -top-1 -right-1 rounded bg-stone-900 px-1 text-[10px] leading-4 text-white">Exam</span>}
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        {(["done", "missed", "planned"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`h-3 w-3 rounded ${DAY_STYLE[s]}`} />
            {p.legend[s]}
          </span>
        ))}
      </div>
    </div>
  );
}

function EmailPreview({ data }: { data: ReminderResponse }) {
  const [tab, setTab] = useState<ReminderType>(data.today_type ?? "planned_day");
  useEffect(() => setTab(data.today_type ?? "planned_day"), [data.today_type]);
  const email = data.emails[tab];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1" role="tablist">
        {(["planned_day", "missed_day"] as const).map((type) => (
          <button
            key={type}
            role="tab"
            aria-selected={tab === type}
            onClick={() => setTab(type)}
            className={`min-h-11 rounded-lg px-2 text-sm font-semibold ${tab === type ? "bg-white shadow-sm" : "text-stone-600"}`}
          >
            {p.emailTypes[type]}
            {data.today_type === type && <span className="ml-1 text-emerald-700">●</span>}
          </button>
        ))}
      </div>
      <p className="text-sm text-stone-600">
        {data.today_type ? (
          <>
            <span className="font-semibold text-emerald-800">● {p.emailToday}: </span>
            {p.emailTypes[data.today_type]}
          </>
        ) : (
          p.emailNone
        )}
      </p>
      <div className="overflow-hidden rounded-xl border border-stone-200">
        <div className="space-y-1 border-b border-stone-200 bg-stone-50 px-4 py-3 text-sm">
          <p className="text-stone-500">{p.to}</p>
          <p className="font-semibold text-stone-900">{email.subject}</p>
        </div>
        <p className="whitespace-pre-wrap px-4 py-3 text-base leading-relaxed text-stone-800">{email.body}</p>
      </div>
    </div>
  );
}

export default function PlanPage() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["lesson", "done"]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [mail, setMail] = useState<ReminderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  async function load() {
    setError(null);
    const [a, b] = await Promise.all([api<PlanResponse>("/api/plan"), api<ReminderResponse>("/api/reminder-preview")]);
    if (!a.ok) return setError(a.error);
    if (!b.ok) return setError(b.error);
    setPlan(a.data);
    setMail(b.data);
  }

  useEffect(() => {
    if (me) void load();
  }, [me]);

  async function skip() {
    setSkipping(true);
    const res = await api("/api/demo/skip-day", { method: "POST" });
    if (!res.ok) setError(res.error);
    await load();
    setSkipping(false);
  }

  if (gateError) return <Shell nav><ErrorCard message={gateError} onRetry={reload} /></Shell>;
  if (error && !plan) return <Shell nav><ErrorCard message={error} onRetry={load} /></Shell>;
  if (!plan || !mail) {
    return (
      <Shell nav>
        <Card>
          <Skeleton lines={6} />
        </Card>
      </Shell>
    );
  }

  const { pace } = plan;
  const finished = plan.next === null;
  const paceColor = finished || pace.on_track ? "text-emerald-700" : "text-amber-700";

  return (
    <Shell nav demoOffset={plan.demo_day_offset}>
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-stone-500">{plan.course_title}</p>
          <h1 className={`text-3xl font-bold tracking-tight ${paceColor}`}>{pace.line}</h1>
          <p className="text-base text-stone-600">
            {p.examOn(formatDate(plan.deadline, { weekday: "short", month: "long", day: "numeric", year: "numeric" }))}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat value={pace.lessons_left} label={p.lessonsLeft} />
          <Stat value={pace.days_left} label={p.daysLeft} />
          <Stat value={plan.streak} label={p.streak} />
          <Stat value={plan.sessions_done} label={p.sessions} />
        </div>

        {error && <ErrorCard message={error} onRetry={load} />}

        <Card className="space-y-3">
          <p className="text-sm font-bold uppercase tracking-wide text-stone-500">
            {p.today} · {formatDate(plan.today)}
          </p>
          {finished ? (
            <>
              <p className="text-lg font-semibold">{p.finished}</p>
              <Button className="w-full" onClick={() => router.push("/done")}>
                {copy.done.title}
              </Button>
            </>
          ) : (
            <>
              {plan.studied_today && <p className="text-base font-semibold text-emerald-800">✓ {p.doneToday}</p>}
              <div>
                <p className="text-lg font-semibold">
                  {copy.lesson.modes[plan.next!.mode]}: {plan.next!.unit_title}
                </p>
                <p className="text-sm text-stone-500">{copy.lesson.minutes(plan.next!.minutes)}</p>
              </div>
              <p className="rounded-xl bg-amber-50 p-3 text-base text-amber-950">{plan.next!.why}</p>
              <Button className="w-full" variant={plan.studied_today ? "secondary" : "primary"} onClick={() => router.push("/lesson")}>
                {plan.studied_today ? p.another : p.start}
              </Button>
            </>
          )}
        </Card>

        <Card className="space-y-3 border-dashed border-amber-300 bg-amber-50/50">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-bold uppercase tracking-wide text-amber-900">{p.demo}</p>
            <p className="text-sm text-amber-900">{p.demoDay(plan.demo_day_offset)}</p>
          </div>
          <Button variant="secondary" className="w-full" disabled={skipping} onClick={skip}>
            {skipping ? <Spinner label={p.skipping} /> : p.skip}
          </Button>
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">{p.calendar}</h2>
          <Calendar days={plan.calendar} />
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">{p.email}</h2>
          <EmailPreview data={mail} />
        </Card>

        <Card className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">{p.units}</h2>
          <ol className="divide-y divide-stone-100">
            {plan.units.map((u, i) => (
              <li key={u.unit_id} className="flex items-center justify-between gap-3 py-3">
                <span className="text-base">
                  <span className="mr-2 text-stone-400">{i + 1}.</span>
                  {u.title}
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[u.status]}`}>{p.status[u.status]}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </Shell>
  );
}
