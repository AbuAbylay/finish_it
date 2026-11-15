"use client";
// Home: today's one lesson, the course at a glance, and what comes back for review.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Icon } from "@/components/icons";
import { BandCard } from "@/components/lesson/BandCard";
import { EmptyState } from "@/components/lesson/EmptyState";
import { ModeBadges } from "@/components/lesson/ModeBadges";
import { ErrorCard } from "@/components/ui";
import { useGate } from "@/components/useGate";
import { WhyLine } from "@/components/WhyLine";
import type { PlanResponse } from "@/lib/api-types";
import { api } from "@/lib/client";
import { copy } from "@/lib/content";
import { homeCopy as h, paceSentence, sourceCopy, todayButton } from "@/lib/copy/pages";
import { longDate, shortDate } from "@/lib/dates";

const primaryLink =
  "inline-flex h-12 w-full items-center justify-center gap-2 rounded-control bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover sm:w-auto";
const secondaryLink =
  "inline-flex min-h-tap w-full items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-5 font-semibold text-ink hover:bg-surface-muted sm:w-auto";

function SkeletonCard() {
  return (
    <div className="space-y-3 rounded-card border border-line bg-surface p-5 md:p-6" aria-hidden>
      <div className="skeleton h-6 w-1/2" />
      <div className="skeleton h-4 w-11/12" />
      <div className="skeleton h-4 w-3/4" />
    </div>
  );
}

export default function Home() {
  const { me, error: gateError, reload } = useGate(["lesson", "done"]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await api<PlanResponse>("/api/plan");
    if (res.ok) setPlan(res.data);
    else setError(res.error);
  }

  // `me` is reloaded by useGate after the demo clock moves, which reloads this page's data too.
  useEffect(() => {
    if (me) void load();
  }, [me]);

  if (gateError) {
    return (
      <AppShell me={me} title={h.title}>
        <ErrorCard message={gateError} onRetry={reload} />
      </AppShell>
    );
  }

  const pace = plan ? paceSentence(plan.pace) : null;
  const behind = plan ? !plan.pace.on_track && plan.pace.lessons_left > 0 : false;
  const pct = plan ? Math.round((plan.units_done / Math.max(plan.units_total, 1)) * 100) : 0;
  // A session of 25 minutes or more is two short lessons: after the first, today is not done yet.
  const oneMore = plan ? plan.session.lessons_in_session === 2 && plan.session.lessons_done_today === 1 : false;

  return (
    <AppShell me={me} title={h.title}>
      <div className="mx-auto max-w-content space-y-5 md:space-y-6">
        {error && <ErrorCard message={error} onRetry={load} />}
        {!plan && !error && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="lg:col-span-2">
              <SkeletonCard />
            </div>
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {plan && (
          <div className="grid gap-5 md:gap-6 lg:grid-cols-2">
            <section aria-labelledby="today-title" className="space-y-4 lg:col-span-2">
              <h1 id="today-title" className="text-small font-semibold text-ink-muted">
                {longDate(plan.today)}
              </h1>
              {plan.next ? (
                <>
                  <div className="space-y-3">
                    <ModeBadges mode={plan.next.mode} minutes={plan.next.minutes} />
                    <p className="lesson-title text-ink">{plan.next.unit_title}</p>
                  </div>
                  <WhyLine text={plan.next.why} />
                  {plan.studied_today && (
                    <p className="flex items-center gap-2 text-body font-semibold text-accent-strong">
                      <Icon name="check-circle" />
                      {oneMore ? copy.session.oneMore(1, plan.session.lessons_in_session) : h.doneToday}
                    </p>
                  )}
                  <Link href="/lesson" className={plan.studied_today && !oneMore ? secondaryLink : primaryLink}>
                    {todayButton(plan)}
                  </Link>
                </>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-h3 text-accent-strong">
                    <Icon name="check-circle" />
                    {h.finished}
                  </p>
                  <Link href="/done" className={primaryLink}>
                    {h.toFinish}
                  </Link>
                </>
              )}
            </section>

            <BandCard labelledBy="course-title" title={h.myCourse}>
              <div className="space-y-1">
                <p className="text-h3 text-ink">{plan.course_title}</p>
                {me?.course?.source === "topic" && <p className="text-small text-ink-muted">{sourceCopy("topic").note}</p>}
                <p className="text-small text-ink-muted">{h.examOn(shortDate(plan.deadline))}</p>
              </div>
              <div className="space-y-2">
                <p className="text-small font-semibold text-ink">{h.topicsDone(plan.units_done, plan.units_total)}</p>
                <div
                  role="progressbar"
                  aria-label={h.topicsDone(plan.units_done, plan.units_total)}
                  aria-valuemin={0}
                  aria-valuemax={plan.units_total}
                  aria-valuenow={plan.units_done}
                  className="h-2 overflow-hidden rounded-full bg-surface-muted"
                >
                  <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
              </div>
              {pace && (
                <div className={`flex items-start gap-2 ${behind ? "text-warn" : "text-accent-strong"}`}>
                  <Icon name={behind ? "alert" : "check-circle"} className="mt-0.5 size-5" />
                  <div>
                    <p className="text-body font-semibold">{pace.line}</p>
                    {pace.suggestion && <p className="text-small text-ink-muted">{pace.suggestion}</p>}
                  </div>
                </div>
              )}
              <Link href="/plan" className={secondaryLink}>
                {h.seePlan}
              </Link>
            </BandCard>

            <BandCard labelledBy="review-title" title={h.reviewTitle}>
              {plan.reviews.length === 0 ? (
                <EmptyState icon="check-circle" title={h.reviewEmptyTitle} line={h.reviewEmptyLine} />
              ) : (
                <ul className="divide-y divide-line">
                  {plan.reviews.map((r) => (
                    <li key={`${r.unit_id}:${r.concept}`} className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-h3 text-ink">“{r.concept}”</p>
                        <p className="text-small text-ink-muted">{h.fromUnit(r.unit_title)}</p>
                      </div>
                      <span
                        className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-small font-semibold ${r.due_now ? "bg-warn-soft text-warn" : "bg-surface-muted text-ink-muted"}`}
                      >
                        <Icon name={r.due_now ? "refresh" : "clock"} className="size-4" />
                        {r.due_now ? h.dueToday : h.backOn(shortDate(r.review_due))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </BandCard>
          </div>
        )}
      </div>
    </AppShell>
  );
}
