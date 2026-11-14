"use client";
// Browser side: the API wrapper, drafts, stable shuffles and the demo day-change signal.
// Identity is a session cookie handled by the server (lib/identity.ts); pages never see or send the ID.

let clientKeyValue = "anon";

/** Set from /api/me so drafts and shuffles are per learner without exposing the ID. */
export function setClientKey(key: string): void {
  clientKeyValue = key;
}

export function clientKey(): string {
  return clientKeyValue;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code: string };

/**
 * What the learner reads when an error response carries no message of its own: the host answered
 * instead of the app (a function that ran out of time, a gateway error).
 */
export function fallbackError(status: number): string {
  if (status === 504 || status === 408) return "That took too long to answer. Please try again.";
  if (status >= 500) return "Something went wrong on our side. Please try again.";
  if (status === 429) return "Too many requests just now. Wait a moment, then try again.";
  return "That request didn't go through. Please try again.";
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!res.ok) return { ok: false, status: res.status, error: data.error || fallbackError(res.status), code: data.code ?? "error" };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: "We couldn't reach the server. Check your connection and try again.", code: "network" };
  }
}

/** Ends the session and goes to the ID page. */
export async function signOut(): Promise<void> {
  await api("/api/identity/sign-out", { method: "POST" });
  window.location.href = "/enter";
}

/** Per-learner draft storage, so a refresh keeps half-finished forms. */
export function loadDraft<T>(name: string): T | null {
  try {
    const raw = localStorage.getItem(`fic_${name}_${clientKeyValue}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(name: string, value: unknown): void {
  try {
    localStorage.setItem(`fic_${name}_${clientKeyValue}`, JSON.stringify(value));
  } catch {
    // drafts are a convenience only
  }
}

export function clearDraft(name: string): void {
  try {
    localStorage.removeItem(`fic_${name}_${clientKeyValue}`);
  } catch {
    // ignore
  }
}

/** Deterministic shuffle: the same seed always gives the same order, so a refresh keeps option positions. */
export function shuffledIndexes(n: number, seed: string): number[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let state = h >>> 0;
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const idx = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

const DAY_EVENT = "fic:day-changed";

/** Fired after the demo clock moves or the demo resets, so every mounted page reloads its data. */
export function emitDayChange(): void {
  window.dispatchEvent(new Event(DAY_EVENT));
}

export function onDayChange(callback: () => void): () => void {
  window.addEventListener(DAY_EVENT, callback);
  return () => window.removeEventListener(DAY_EVENT, callback);
}
