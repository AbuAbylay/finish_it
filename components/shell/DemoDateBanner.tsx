"use client";
// Shown on every page while the demo clock is moved: says the date is simulated and offers the reset.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, emitDayChange } from "@/lib/client";
import { copy } from "@/lib/content";
import { addDays, shortDate } from "@/lib/dates";
import { Icon } from "../icons";
import { Button } from "../ui";

const d = copy.demo;

export function DemoDateBanner({ today, offset }: { today: string; offset: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reset() {
    setBusy(true);
    setError(null);
    const res = await api("/api/demo/reset", { method: "POST" });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setConfirming(false);
    emitDayChange();
    router.push("/survey");
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warn-line bg-warn-soft px-4 py-1.5 text-small text-ink md:px-8" role="status">
      <p className="flex min-w-0 items-center gap-2">
        <Icon name="clock" className="size-4 shrink-0 text-warn" />
        <span>
          <strong className="font-semibold text-warn">{d.dateLabel}:</strong> {d.dateLine(shortDate(today), shortDate(addDays(today, -offset)))}
        </span>
      </p>
      {confirming ? (
        <span className="flex flex-wrap items-center gap-2">
          <span>{d.resetConfirm}</span>
          <Button variant="danger" className="px-3 text-small" busy={busy} onClick={reset}>
            {d.resetYes}
          </Button>
          <Button variant="ghost" className="px-3 text-small" disabled={busy} onClick={() => setConfirming(false)}>
            {d.resetCancel}
          </Button>
        </span>
      ) : (
        <Button variant="ghost" className="px-3 text-small underline underline-offset-4" onClick={() => setConfirming(true)}>
          {d.reset}
        </Button>
      )}
      {error && (
        <p role="alert" className="w-full text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
