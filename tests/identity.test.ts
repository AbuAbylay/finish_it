// ID entry: format, lookup, sessions and the per-IP limit on failed lookups.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { MeResponse } from "@/lib/api-types";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

let generate: (req: import("next/server").NextRequest) => Promise<Response>;
let enter: typeof generate;
let me: typeof generate;
let signOut: typeof generate;

beforeAll(async () => {
  generate = (await import("@/app/api/identity/generate/route")).POST;
  enter = (await import("@/app/api/identity/enter/route")).POST;
  me = (await import("@/app/api/me/route")).GET;
  signOut = (await import("@/app/api/identity/sign-out/route")).POST;
});

describe("login IDs", () => {
  it("generated IDs are long, random and valid", async () => {
    const { generateLoginId, isValidLoginId } = await import("@/lib/identity");
    const ids = new Set(Array.from({ length: 200 }, generateLoginId));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-hjkmnp-tv-z]{5}(-[0-9a-hjkmnp-tv-z]{5}){3}$/);
      expect(isValidLoginId(id)).toBe(true);
    }
  });

  it("typed IDs are 8 to 40 letters, digits and dashes, case-insensitive", async () => {
    const { isValidLoginId, normalizeLoginId } = await import("@/lib/identity");
    expect(normalizeLoginId("  ABCD-1234 ")).toBe("abcd-1234");
    expect(isValidLoginId("abcd-123")).toBe(true);
    expect(isValidLoginId("abc")).toBe(false);
    expect(isValidLoginId("has space")).toBe(false);
    expect(isValidLoginId("x".repeat(41))).toBe(false);
  });
});

describe("ID entry flow", () => {
  it("generate signs in with the sample course attached; the same ID in another window returns to the same learner", async () => {
    const first = new Client("10.1.0.1");
    const gen = await first.call<{ login_id: string; stage: string }>(generate, "/api/identity/generate", { method: "POST" });
    expect(gen.status).toBe(200);
    expect(gen.data.stage).toBe("survey");
    const a = await first.call<MeResponse>(me, "/api/me");
    expect(a.data).toMatchObject({ stage: "survey", login_id: gen.data.login_id, ai: "stub" });
    expect(a.data.course?.units.length).toBeGreaterThan(0);

    const second = new Client("10.1.0.2");
    expect((await second.call(me, "/api/me")).status).toBe(401);
    const typed = await second.call<{ stage: string }>(enter, "/api/identity/enter", { method: "POST", body: { login_id: gen.data.login_id.toUpperCase() } });
    expect(typed.status).toBe(200);
    const b = await second.call<MeResponse>(me, "/api/me");
    expect(b.data.client_key).toBe(a.data.client_key);

    await second.call(signOut, "/api/identity/sign-out", { method: "POST" });
    expect((await second.call(me, "/api/me")).status).toBe(401);
    expect((await first.call(me, "/api/me")).status).toBe(200); // the other session is untouched
  });

  it("an unknown or malformed ID gets a friendly message", async () => {
    const c = new Client("10.1.0.3");
    const unknown = await c.call(enter, "/api/identity/enter", { method: "POST", body: { login_id: "zzzzz-zzzzz-zzzzz-zzzzz" } });
    expect(unknown).toMatchObject({ status: 404, data: { code: "unknown_id" } });
    expect(unknown.data.error).toMatch(/don't recognise/);
    const bad = await c.call(enter, "/api/identity/enter", { method: "POST", body: { login_id: "no" } });
    expect(bad).toMatchObject({ status: 400, data: { code: "bad_id" } });
  });

  it("failed lookups are rate-limited per IP", async () => {
    const attacker = new Client("10.9.9.9");
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await attacker.call(enter, "/api/identity/enter", { method: "POST", body: { login_id: `guess-${String(i).padStart(4, "0")}` } });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 404)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    // Another IP is not affected.
    const other = await new Client("10.9.9.8").call(enter, "/api/identity/enter", { method: "POST", body: { login_id: "guess-0000" } });
    expect(other.status).toBe(404);
  });
});
