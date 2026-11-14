"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MeResponse, Stage } from "@/lib/api-types";
import { api, onDayChange, setClientKey } from "@/lib/client";

/** Where each stage lives. "start" is a learner with an ID and no course yet: they add one on /upload. */
export const STAGE_HOME: Record<Stage, string> = {
  start: "/upload",
  survey: "/survey",
  test: "/test",
  lesson: "/",
  done: "/done",
};

/**
 * Loads where the learner is in the flow. Signed out -> /enter. A stage this page does not allow
 * -> that stage's home. Reloads after the demo clock moves.
 */
export function useGate(allowed: Stage[]) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = allowed.join(",");

  const load = useCallback(async () => {
    setError(null);
    const res = await api<MeResponse>("/api/me");
    if (!res.ok) {
      if (res.status === 401) return router.replace("/enter");
      return setError(res.error);
    }
    setClientKey(res.data.client_key);
    if (!key.split(",").includes(res.data.stage)) return router.replace(STAGE_HOME[res.data.stage]);
    setMe(res.data);
  }, [key, router]);

  useEffect(() => {
    void load();
    return onDayChange(() => void load());
  }, [load]);

  return { me, error, reload: load };
}
