"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Button, Card, ErrorCard, Spinner } from "@/components/ui";
import { useGate } from "@/components/useGate";
import type { PlanResponse } from "@/lib/api-types";
import { api, resetLearner } from "@/lib/client";
import { copy } from "@/lib/content";

export default function Done() {
  const router = useRouter();
  const { me, error: gateError, reload } = useGate(["done"]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await api<PlanResponse>("/api/plan");
    if (res.ok) setPlan(res.data);
    else setError(res.error);
  }

  useEffect(() => {
    if (me) void load();
  }, [me]);

  if (gateError || error) return <Shell nav><ErrorCard message={gateError ?? error ?? ""} onRetry={gateError ? reload : load} /></Shell>;
  if (!plan) return <Shell nav><Spinner /></Shell>;

  return (
    <Shell nav demoOffset={plan.demo_day_offset}>
      <div className="space-y-6 pt-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-600 text-3xl text-white" aria-hidden>
          ✓
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{copy.done.title}</h1>
        <p className="text-lg text-stone-600">{copy.done.sub}</p>
        <Card className="space-y-1">
          <p className="text-lg font-semibold">{plan.course_title}</p>
          <p className="text-stone-600">{copy.done.sessions(plan.sessions_done)}</p>
        </Card>
        <div className="grid gap-2">
          <Button onClick={() => router.push("/plan")}>{copy.done.toPlan}</Button>
          <Button
            variant="ghost"
            onClick={() => {
              resetLearner();
              router.push("/");
            }}
          >
            {copy.landing.startOver}
          </Button>
        </div>
      </div>
    </Shell>
  );
}
