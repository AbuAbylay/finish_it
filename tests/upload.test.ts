// A learner's own course text: POST /api/course { source: "upload", text } through the real route handlers
// against an in-memory database. With no API key the dev stub's setupCourse answers.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { MeResponse, PresentedLesson } from "@/lib/api-types";
import { addDays } from "@/lib/dates";
import { UPLOAD_MAX_CHARS, UPLOAD_MIN_CHARS } from "@/lib/upload";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  me: (await import("@/app/api/me/route")).GET,
  course: (await import("@/app/api/course/route")).POST,
  profile: (await import("@/app/api/profile/route")).POST,
  placement: await import("@/app/api/placement/route"),
  lesson: (await import("@/app/api/lesson/route")).GET,
  check: (await import("@/app/api/answers/check/route")).POST,
  answers: (await import("@/app/api/answers/route")).POST,
  db: await import("@/lib/db"),
});

let r: Awaited<ReturnType<typeof routes>>;

interface CourseResponse {
  course_plan_id: string;
  title: string;
  units: { unit_id: string; title: string }[];
  kept: boolean;
}

const TOPICS = ["scope", "schedule", "budget", "quality", "risk", "stakeholders", "procurement", "communication"];

/** Eight paragraphs of about forty words each, separated by blank lines, as pasted course notes would be. */
const MATERIAL = TOPICS.map(
  (t, i) =>
    `Part ${i + 1} covers ${t} management for a small project team. The project manager writes the ${t} plan before the work starts and reviews it with the sponsor every week. ` +
    `When the ${t} plan changes, the team records the reason, the owner and the new date in the project log.`,
).join("\n\n");

async function signedIn(ip: string): Promise<Client> {
  const client = new Client(ip);
  const gen = await client.call(r.generate, "/api/identity/generate", { method: "POST" });
  expect(gen.status).toBe(200);
  return client;
}

const upload = (client: Client, text: string) =>
  client.call<CourseResponse>(r.course, "/api/course", { method: "POST", body: { source: "upload", text } });

const since = () => new Date(Date.now() - 3600 * 1000).toISOString();

beforeAll(async () => {
  r = await routes();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/course with the learner's own text", () => {
  it("is refused when signed out", async () => {
    const res = await upload(new Client("10.1.0.1"), MATERIAL);
    expect(res.status).toBe(401);
    expect(res.data.code).toBe("signed_out");
  });

  it("builds a plan from the text, attaches it and moves the learner to the survey", async () => {
    const client = await signedIn("10.1.0.2");
    const before = await client.call<MeResponse>(r.me, "/api/me");
    expect(before.data.sample).not.toBeNull();
    const logged = vi.spyOn(r.db, "logGeneration");

    const res = await upload(client, MATERIAL);
    expect(res.status).toBe(200);
    expect(res.data.kept).toBe(false);
    expect(res.data.course_plan_id).toMatch(/^upload-[0-9a-f]{12}$/);
    expect(res.data.units).toHaveLength(TOPICS.length);

    const me = await client.call<MeResponse>(r.me, "/api/me");
    expect(me.data.stage).toBe("survey");
    expect(me.data.sample).toBeNull();
    expect(me.data.profile).toBeNull();
    expect(me.data.course?.title).toBe(res.data.title);
    expect(me.data.course?.units).toEqual(res.data.units);

    // The stored plan cuts its excerpts from the learner's own text.
    const plan = await r.db.loadPlan(res.data.course_plan_id);
    expect(plan?.units[0].excerpt).toContain("Part 1 covers scope management");

    // One model call, logged as a setup generation against this learner's network.
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged.mock.calls[0].slice(1)).toEqual(["10.1.0.2", "setup"]);
    expect(await r.db.countGenerations(since(), { ip: "10.1.0.2" })).toBe(1);
  });

  it("refuses text that is too short or too long without calling the model", async () => {
    const client = await signedIn("10.1.0.3");
    const logged = vi.spyOn(r.db, "logGeneration");

    // Two characters cannot name a subject. A few words can: they go to the setup call as a subject (ai/real.ts).
    const short = await upload(client, "ab");
    expect(short.status).toBe(400);
    expect(short.data.code).toBe("too_short");
    expect(short.data.error).toBeTruthy();

    const edge = await upload(client, `  ${"x".repeat(UPLOAD_MIN_CHARS - 1)}  `);
    expect(edge.status).toBe(400);

    const long = await upload(client, "word ".repeat(UPLOAD_MAX_CHARS / 5 + 1));
    expect(long.status).toBe(413);
    expect(long.data.code).toBe("too_long");

    expect(logged).not.toHaveBeenCalled();
    const me = await client.call<MeResponse>(r.me, "/api/me");
    expect(me.data.sample).not.toBeNull(); // still on the course they had
  });

  it("holds failed calls to a few per ten minutes, so they cannot use up the global cap", async () => {
    const client = await signedIn("10.1.0.9");
    const logged = vi.spyOn(r.db, "logGeneration");
    for (let i = 0; i < 59; i++) await r.db.logGeneration(`someone-${i}`, "10.1.0.9", "failed");
    expect((await upload(client, MATERIAL)).status).toBe(200); // 59 failures on this network: still fine
    await r.db.logGeneration("someone-else", "10.1.0.9", "failed");
    logged.mockClear();
    const blocked = await upload(client, MATERIAL);
    expect(blocked.status).toBe(429);
    expect(blocked.data.code).toBe("rate_limited");
    expect(logged).not.toHaveBeenCalled(); // refused before any model call

    // A learner on another network is not affected, until their own failures add up.
    const other = await signedIn("10.1.0.10");
    for (let i = 0; i < 8; i++) expect((await upload(other, "risk register entry, ".repeat(90))).status).toBe(502);
    expect((await upload(other, MATERIAL)).status).toBe(429);
  });

  it("returns a retryable error and keeps the current course when the plan cannot be built", async () => {
    const client = await signedIn("10.1.0.4");
    const logged = vi.spyOn(r.db, "logGeneration");
    vi.spyOn(console, "error").mockImplementation(() => {}); // the route logs the failure
    // Long enough to pass the size check, but one run-on line gives the stub nothing to split into topics.
    const res = await upload(client, "risk register entry, ".repeat(90));
    expect(res.status).toBe(502);
    expect(res.data.code).toBe("ai_error");
    expect(res.data.error).toBeTruthy();

    // A failed call counts toward the global cap only, never against the learner or their network.
    expect(logged.mock.calls.map((call) => call[2])).toEqual(["failed"]);
    expect(await r.db.countGenerations(since(), { ip: "10.1.0.4" })).toBe(0);
    const me = await client.call<MeResponse>(r.me, "/api/me");
    expect(me.data.stage).toBe("survey");
    expect(me.data.sample).not.toBeNull();
  });

  it("leaves a learner who already has lessons on their course", async () => {
    const client = await signedIn("10.1.0.5");
    const start = await client.call<MeResponse>(r.me, "/api/me");
    await client.call(r.profile, "/api/profile", {
      method: "POST",
      body: {
        profile: {
          course_title: "PMP exam prep",
          goal: "Move into a project manager role",
          success: "Pass the PMP exam on the first attempt",
          focus: [],
          skip: [],
          minutes_per_day: 15,
          study_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
          deadline: addDays(start.data.today, 14),
          prior_knowledge: "Leads projects, self-taught",
          blocker: "time",
          blocker_note: "",
        },
      },
    });
    const q = await client.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
    await client.call(r.placement.POST, "/api/placement", {
      method: "POST",
      body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) },
    });
    const lesson = await client.call<PresentedLesson>(r.lesson, "/api/lesson");
    expect(lesson.status).toBe(200);
    const row = (await r.db.loadLesson(lesson.data.lesson_key))!;
    for (const question of [...row.lesson.quiz, ...row.lesson.review_quiz]) {
      await client.call(r.check, "/api/answers/check", {
        method: "POST",
        body: { lesson_key: row.lesson_key, question_id: question.question_id, choice: question.correct_index },
      });
    }
    const graded = await client.call(r.answers, "/api/answers", { method: "POST", body: { lesson_key: row.lesson_key } });
    expect(graded.status).toBe(200);

    const before = await client.call<MeResponse>(r.me, "/api/me");
    const logged = vi.spyOn(r.db, "logGeneration");
    const res = await upload(client, MATERIAL);
    expect(res.status).toBe(200);
    expect(res.data.kept).toBe(true);
    expect(res.data.course_plan_id).not.toMatch(/^upload-/);
    expect(logged).not.toHaveBeenCalled();

    const after = await client.call<MeResponse>(r.me, "/api/me");
    expect(after.data.course).toEqual(before.data.course);
    expect(after.data.stage).toBe(before.data.stage);
    expect(after.data.sample).not.toBeNull();
  });
});
