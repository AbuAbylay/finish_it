"use client";
// Demo controls inside the calendar popover: move the learner's "today" forward, or reset the demo.
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SkipResponse } from "@/lib/api-types";
import { api, emitDayChange } from "@/lib/client";
import { copy } from "@/lib/content";
import { shortDate } from "@/lib/dates";
import { Icon } from "../icons";
import { Button } from "../ui";

const d = copy.demo;

export function DemoControls({ today, onReset }: { today: string; onReset: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"skip1" | "skip3" | "reset" | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function skip(days: 1 | 3) {
    setBusy(days === 1 ? "skip1" : "skip3");
    setError(null);
    const res = await api<SkipResponse>("/api/demo/skip-day", { method: "POST", body: { days } });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    emitDayChange();
  }

  async function reset() {
    setBusy("reset");
    setError(null);
    const res = await api("/api/demo/reset", { method: "POST" });
    setBusy(null);
    if (!res.ok) return setError(res.error);
    setConfirming(false);
    emitDayChange();
    onReset();
    router.push("/survey");
  }

  return (
    <section className="space-y-3 rounded-control border border-dashed border-warn-line bg-warn-soft p-4" aria-label={d.label}>
      <div className="space-y-1">
        <p className="text-caption uppercase text-warn">{d.label}</p>
        <p className="text-small text-ink">{d.line}</p>
      </div>
      <p className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1 text-small font-semibold text-warn" aria-live="polite">
        <Icon name="clock" className="size-4" />
        {d.today(shortDate(today))}
      </p>
      <div className="grid gap-2">
        <Button variant="secondary" className="w-full" busy={busy === "skip1"} disabled={busy !== null} onClick={() => skip(1)}>
          {d.skip1}
        </Button>
        <Button variant="secondary" className="w-full" busy={busy === "skip3"} disabled={busy !== null} onClick={() => skip(3)}>
          {d.skip3}
        </Button>
      </div>
      {confirming ? (
        <div className="space-y-2 rounded-control bg-surface p-3">
          <p className="text-small text-ink">{d.resetConfirm}</p>
          <div className="flex gap-2">
            <Button variant="danger" busy={busy === "reset"} disabled={busy !== null} onClick={reset}>
              {d.resetYes}
            </Button>
            <Button variant="ghost" disabled={busy !== null} onClick={() => setConfirming(false)}>
              {d.resetCancel}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" className="w-full" disabled={busy !== null} onClick={() => setConfirming(true)}>
          <Icon name="refresh" />
          {d.reset}
        </Button>
      )}
      {error && (
        <p role="alert" className="flex gap-2 text-small text-danger">
          <Icon name="alert" className="size-4" />
          {error}
        </p>
      )}
    </section>
  );
}
