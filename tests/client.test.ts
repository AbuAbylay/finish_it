// The browser-side API wrapper: what the learner reads when a request fails.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, fallbackError } from "@/lib/client";

function respond(status: number, body: string, contentType = "text/html") {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status, headers: { "content-type": contentType } })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api(): error messages", () => {
  it("keeps the message and code the app sent", async () => {
    respond(403, JSON.stringify({ error: "“Risk” unlocks after you pass “Scope”.", code: "locked" }), "application/json");
    expect(await api("/api/lesson?unit=u05")).toEqual({ ok: false, status: 403, error: "“Risk” unlocks after you pass “Scope”.", code: "locked" });
  });

  it("gives a plain sentence when the host answers without one, never the raw status", async () => {
    respond(500, "<html>Internal Server Error</html>");
    const broken = await api("/api/lessons");
    expect(broken).toMatchObject({ ok: false, status: 500, code: "error", error: "Something went wrong on our side. Please try again." });

    respond(504, "An error occurred with your deployment\n\nFUNCTION_INVOCATION_TIMEOUT");
    const slow = await api("/api/lesson");
    expect(slow).toMatchObject({ ok: false, status: 504, code: "error", error: "That took too long to answer. Please try again." });

    respond(500, JSON.stringify({}), "application/json");
    expect(await api("/api/plan")).toMatchObject({ error: "Something went wrong on our side. Please try again." });
  });

  it("has a sentence for every kind of status, and none shows a number", () => {
    const seen = [400, 404, 408, 413, 429, 500, 502, 503, 504].map(fallbackError);
    for (const message of seen) expect(message).not.toMatch(/\d|Request failed/);
    expect(fallbackError(408)).toBe(fallbackError(504));
    expect(fallbackError(502)).toBe(fallbackError(500));
    expect(new Set([fallbackError(504), fallbackError(500), fallbackError(429), fallbackError(404)]).size).toBe(4);
  });

  it("says so when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))));
    expect(await api("/api/me")).toMatchObject({ ok: false, status: 0, code: "network" });
  });
});
