"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MeResponse, Stage } from "@/lib/api-types";
import { api } from "@/lib/client";

export const STAGE_HOME: Record<Stage, string> = {
  start: "/",
  survey: "/survey",
  test: "/test",
  lesson: "/lesson",
  done: "/done",
};

/** Loads where the learner is in the flow and sends them to the right page if this one is not allowed yet. */
export function useGate(allowed: Stage[]) {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = allowed.join(",");

  const load = useCallback(async () => {
    setError(null);
    const res = await api<MeResponse>("/api/me");
    if (!res.ok) return setError(res.error);
    if (!key.split(",").includes(res.data.stage)) return router.replace(STAGE_HOME[res.data.stage]);
    setMe(res.data);
  }, [key, router]);

  useEffect(() => {
    void load();
  }, [load]);

  return { me, error, reload: load };
}
