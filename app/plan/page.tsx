"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import { CalendarHeader, CalendarMonth } from "@/components/shell/CalendarMonth";
import { PaceLine } from "@/components/shell/PaceLine";
import { useCalendar } from "@/components/shell/useCalendar";
import { Button, Card, ErrorCard, Pill, Skeleton } from "@/components/ui";
import { useGate } from "@/components/useGate";
import { WhyLine } from "@/components/WhyLine";
import type { PlanResponse, ReminderResponse, ReminderType } from "@/lib/api-types";
import { api, onDayChange } from "@/lib/client";
import { copy } from "@/lib/content";
import { shortDate } from "@/lib/dates";

const p = copy.plan;

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4 text-center shadow-card">
      <p className="text-h1 text-ink">{value}</p>
      <p className="text-small text-ink-muted">{label}</p>
    </div>
  );
}

function EmailPreview({ data }: { data: ReminderResponse }) {
  const [tab, setTab] = useState<ReminderType>(data.today_type ?? "planned_day");
  const base = useId();
  useEffect(() => setTab(data.today_type ?? "planned_day"), [data.today_type]);
  const email = data.emails[tab];
  const types = ["planned_day", "missed_day"] as const;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-control bg-surface-muted p-1" role="tablist" aria-label={p.remindersPreview}>
        {types.map((type) => (
          <button
            key={type}
            id={`${base}-${type}`}
            role="tab"
            type="button"
            aria-selected={tab === type}
            aria-controls={`${base}-panel`}
            onClick={() => setTab(type)}
            className={`flex min-h-tap items-center justify-center gap-1.5 rounded-control px-2 text-small font-semibold ${tab === type ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink"}`}
          >
            {p.emailTypes[type]}
            {data.today_type === type && <Icon name="clock" className="size-4 text-accent-strong" />}
          </button>
        ))}
      </div>
      <div>
        {data.today_type ? (
          <Pill icon="clock" tone="accent" label={`${p.emailToday}: ${p.emailTypes[data.today_type]}`} />
        ) : (
          <p className="text-small text-ink-muted">{p.emailNone}</p>
        )}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-${tab}`} className="overflow-hidden rounded-control border border-line">
        <div className="space-y-1 border-b border-line bg-surface-muted px-4 py-3 text-small">
          <p className="text-ink-muted">{p.to}</p>
          <p className="text-h3 text-ink">{email.subject}</p>
        </div>
        <p className="px-4 py-3 text-body whitespace-pre-wrap text-ink">{email.body}</p>
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
  const cal = useCalendar(!!me);
  const titleId = useId();

  const load = useCallback(async () => {
    setError(null);
    const [a, b] = await Promise.all([api<PlanResponse>("/api/plan"), api<ReminderResponse>("/api/reminder-preview")]);
    if (!a.ok) return setError(a.error);
    if (!b.ok) return setError(b.error);
    setPlan(a.data);
    setMail(b.data);
  }, []);

  useEffect(() => {
    if (!me) return;
    void load();
    return onDayChange(() => void load());
  }, [me, load]);

  if (gateError) {
    return (
      <AppShell me={null} title={p.title}>
        <ErrorCard message={gateError} onRetry={reload} />
      </AppShell>
    );
  }
  if (error && !plan) {
    return (
      <AppShell me={me} title={p.title}>
        <ErrorCard message={error} onRetry={load} />
      </AppShell>
    );
  }
  if (!plan || !mail) {
    return (
      <AppShell me={me} title={p.title}>
        <div className="space-y-5" aria-busy="true">
          <div className="skeleton h-10 w-2/3" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton h-24" />
            ))}
          </div>
          <Card>
            <Skeleton lines={6} />
          </Card>
        </div>
      </AppShell>
    );
  }

  const { pace } = plan;
  return (
    <AppShell me={me} title={p.title}>
      <div className="space-y-5 md:space-y-6">
        <header className="space-y-1">
          <p className="text-small font-semibold text-ink-muted">{plan.course_title}</p>
          <h1 className="text-h1 text-ink">{p.title}</h1>
          <p className="flex items-center gap-2 text-body text-ink-muted">
            <Icon name="flag" className="size-4" />
            {p.examOn(shortDate(plan.deadline))}
          </p>
        </header>

        {error && <ErrorCard message={error} onRetry={load} />}

        <Card band={pace.on_track ? "green" : "sand"} bandIcon={pace.on_track ? "check-circle" : "alert"} className="space-y-4">
          <PaceLine pace={pace} size="lg" />
          {plan.next && (
            <div className="space-y-3 border-t border-line pt-4">
              <WhyLine text={plan.next.why} />
              <Button className="w-full sm:w-auto" onClick={() => router.push("/lesson")}>
                {plan.studied_today ? p.another : p.start}
                <Icon name="arrow-right" />
              </Button>
            </div>
          )}
        </Card>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat value={pace.lessons_left} label={p.lessonsLeft} />
          <Stat value={pace.days_left} label={p.daysLeft} />
          <Stat value={plan.streak} label={p.streak} />
          <Stat value={plan.sessions_done} label={p.sessions} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="space-y-4">
            {cal.error && <ErrorCard message={cal.error} onRetry={cal.reload} />}
            {!cal.data && !cal.error && <Skeleton lines={6} />}
            {cal.data && (
              <>
                <CalendarHeader month={cal.data.month} titleId={titleId} onPrev={cal.prev} onNext={cal.next} />
                <CalendarMonth data={cal.data} />
              </>
            )}
          </Card>

          <Card className="space-y-4">
            <div className="space-y-1">
              <h2 className="text-h2 text-ink">{p.reminders}</h2>
              <p className="text-small text-ink-muted">{p.remindersPreview}</p>
            </div>
            <EmailPreview data={mail} />
          </Card>
        </div>

        <Link href="/lessons" className="inline-flex min-h-tap items-center gap-2 rounded-control font-semibold text-ink underline-offset-4 hover:underline">
          {p.allLessons}
          <Icon name="arrow-right" />
        </Link>
      </div>
    </AppShell>
  );
}
