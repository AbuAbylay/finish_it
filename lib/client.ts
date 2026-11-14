"use client";
// Browser side: guest identity and the API wrapper. Every API call sends the learner id and time zone.

const ID_KEY = "fic_learner_id";
let memoryId: string | null = null;

function newId(): string {
  return crypto.randomUUID();
}

/** The guest learner id, created on first visit and kept in localStorage. */
export function learnerId(): string {
  try {
    let id = localStorage.getItem(ID_KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  } catch {
    memoryId ??= newId();
    return memoryId;
  }
}

/** Forget this guest and start fresh. */
export function resetLearner(): void {
  try {
    const old = localStorage.getItem(ID_KEY);
    for (const k of Object.keys(localStorage)) if (old && k.includes(old)) localStorage.removeItem(k);
    localStorage.removeItem(ID_KEY);
  } catch {
    // storage unavailable: the in-memory id resets below
  }
  memoryId = null;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; code: string };

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-learner-id": learnerId(),
        "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (!res.ok) return { ok: false, status: res.status, error: data.error ?? `Request failed (${res.status})`, code: data.code ?? "error" };
    return { ok: true, data };
  } catch {
    return { ok: false, status: 0, error: "We couldn't reach the server. Check your connection and try again.", code: "network" };
  }
}

/** Per-learner draft storage, so a refresh keeps half-finished forms. */
export function loadDraft<T>(name: string): T | null {
  try {
    const raw = localStorage.getItem(`fic_${name}_${learnerId()}`);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(name: string, value: unknown): void {
  try {
    localStorage.setItem(`fic_${name}_${learnerId()}`, JSON.stringify(value));
  } catch {
    // drafts are a convenience only
  }
}

export function clearDraft(name: string): void {
  try {
    localStorage.removeItem(`fic_${name}_${learnerId()}`);
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
