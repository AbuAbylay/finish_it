"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Button, Card, ErrorCard, Skeleton } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { PlanResponse } from "@/lib/api-types";
import { api, clearDraft, onDayChange } from "@/lib/client";
import { copy } from "@/lib/content";
import { diffDays } from "@/lib/dates";

export default function Done() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["done"]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);

  /** Nothing was studied: take the short check back and reopen the questions at the topics. */
  async function chooseAgain() {
    setChoosing(true);
    const res = await api("/api/placement", { method: "DELETE" });
    if (!res.ok) {
      setChoosing(false);
      return setError(res.error);
    }
    clearDraft("survey");
    router.push("/survey?q=4");
  }

  async function load() {
    setError(null);
    const res = await api<PlanResponse>("/api/plan");
    if (res.ok) setPlan(res.data);
    else setError(res.error);
  }

  useEffect(() => {
    if (!me) return;
    void load();
    return onDayChange(() => void load());
  }, [me]);

  if (gateError || error) {
    return (
      <AppShell me={me} title={copy.done.title}>
        <ErrorCard message={gateError ?? error ?? ""} onRetry={gateError ? reload : load} />
      </AppShell>
    );
  }

  return (
    <AppShell me={me} title={copy.done.title}>
      <div className="mx-auto max-w-reading">
        {!plan ? (
          <Card>
            <Skeleton lines={4} />
          </Card>
        ) : plan.sessions_done === 0 ? (
          <Card className="space-y-5">
            <div className="space-y-2">
              <p className="text-small font-semibold text-ink-muted">{plan.course_title}</p>
              <h1 className="text-h1 text-ink">{copy.done.nothingTitle}</h1>
              <p className="text-body-lg text-ink">{copy.done.nothingLine}</p>
            </div>
            <Button className="w-full sm:w-auto" busy={choosing} busyLabel={copy.done.choosing} onClick={chooseAgain}>
              {copy.done.chooseAgain}
            </Button>
          </Card>
        ) : (
          <Card className="space-y-5">
            <div className="space-y-2">
              <p className="text-small font-semibold text-ink-muted">{plan.course_title}</p>
              <h1 className="text-display text-ink">{copy.done.title}</h1>
              <p className="text-body-lg text-ink">{copy.done.line(plan.units_total, plan.sessions_done, diffDays(plan.today, plan.deadline))}</p>
            </div>
            <Button className="w-full sm:w-auto" onClick={() => router.push("/plan")}>
              {copy.done.toPlan}
            </Button>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
