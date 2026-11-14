"use client";
import { useCallback, useEffect, useState } from "react";
import type { CalendarResponse } from "@/lib/api-types";
import { api, onDayChange } from "@/lib/client";

function shift(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** Month data for the calendar. `month` null follows the learner's today (also after Skip). */
export function useCalendar(enabled: boolean) {
  const [month, setMonth] = useState<string | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await api<CalendarResponse>(`/api/calendar${month ? `?month=${month}` : ""}`);
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, [month]);

  useEffect(() => {
    if (!enabled) return;
    void load();
    return onDayChange(() => void load());
  }, [enabled, load]);

  return {
    data,
    error,
    reload: load,
    prev: () => data && setMonth(shift(data.month, -1)),
    next: () => data && setMonth(shift(data.month, 1)),
    resetMonth: () => setMonth(null),
  };
}

export function monthTitle(month: string): string {
  return new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
