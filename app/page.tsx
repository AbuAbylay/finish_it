"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { Button, Card, ErrorCard, Spinner } from "@/components/ui";
import { STAGE_HOME } from "@/components/useGate";
import type { MeResponse } from "@/lib/api-types";
import { api, resetLearner } from "@/lib/client";
import { copy } from "@/lib/content";

export default function Landing() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMe() {
    setError(null);
    const res = await api<MeResponse>("/api/me");
    if (res.ok) setMe(res.data);
    else setError(res.error);
  }

  useEffect(() => {
    void loadMe();
  }, []);

  async function startSample() {
    setBusy(true);
    setError(null);
    const res = await api("/api/course", { method: "POST", body: { source: "sample" } });
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    router.push("/survey");
  }

  function startOver() {
    resetLearner();
    setMe(null);
    void loadMe();
  }

  const returning = me && me.stage !== "start";

  return (
    <Shell>
      <div className="space-y-8 pt-4 sm:pt-10">
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-4xl">{copy.landing.oneLiner}</h1>
          <p className="text-lg leading-relaxed text-stone-600">{copy.landing.sub}</p>
        </div>

        <ul className="space-y-3">
          {copy.landing.points.map((p) => (
            <li key={p} className="flex gap-3 text-base text-stone-800">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-sm text-emerald-800" aria-hidden>
                ✓
              </span>
              <span>{p}</span>
            </li>
          ))}
        </ul>

        {error && <ErrorCard message={error} onRetry={me ? startSample : loadMe} />}

        <Card className="space-y-4">
          {!me && !error && <Spinner />}
          {me && busy && <Spinner label={copy.landing.starting} />}
          {me && !busy && returning && (
            <>
              <Button className="w-full" onClick={() => router.push(me.stage === "lesson" ? "/plan" : STAGE_HOME[me.stage])}>
                {copy.landing.continue}
              </Button>
              <Button variant="ghost" className="w-full" onClick={startOver}>
                {copy.landing.startOver}
              </Button>
            </>
          )}
          {me && !busy && !returning && (
            <>
              <Button className="w-full" onClick={startSample}>
                {copy.landing.startSample}
              </Button>
              <p className="text-center text-sm text-stone-500">{copy.landing.sampleNote}</p>
            </>
          )}
        </Card>
      </div>
    </Shell>
  );
}
