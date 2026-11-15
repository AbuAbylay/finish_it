// A plan built from a few words naming a subject holds study notes written by AI (`source: "topic"`).
// The API carries that to every page, and no label then calls those notes the learner's course.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "./routes";
import type { MeResponse, PresentedLesson } from "@/lib/api-types";
import { sourceCopy, uploadCopy } from "@/lib/copy/pages";
import { addDays } from "@/lib/dates";
import type { CoursePlan, Profile } from "@/lib/types";

vi.mock("server-only", () => ({}));
process.env.TURSO_DATABASE_URL = ":memory:";

const NOTES = ["scope", "schedule", "budget", "quality", "risk", "stakeholders"]
  .map(
    (t, i) =>
      `Part ${i + 1} covers ${t} management for a small project team. The project manager writes the ${t} plan before the work starts and reviews it with the sponsor every week. ` +
      `When the ${t} plan changes, the team records the reason, the owner and the new date in the project log.`,
  )
  .join("\n\n");

// The dev stub cannot write notes for a subject, so a short input gets a stub plan marked the way ai/real.ts marks it.
vi.mock("@/ai", async (original) => {
  const actual = await original<typeof import("@/ai")>();
  return {
    ...actual,
    setupCourse: async (text: string, profile: Profile | null) => {
      if (text.length >= 900) return actual.setupCourse(text, profile);
      const plan = (await actual.setupCourse(NOTES, profile)) as CoursePlan;
      return { ...plan, title: "PMP exam", source: "topic" as const };
    },
  };
});

const routes = async () => ({
  generate: (await import("@/app/api/identity/generate/route")).POST,
  me: (await import("@/app/api/me/route")).GET,
  course: (await import("@/app/api/course/route")).POST,
  profile: (await import("@/app/api/profile/route")).POST,
  placement: await import("@/app/api/placement/route"),
  lesson: (await import("@/app/api/lesson/route")).GET,
});
let r: Awaited<ReturnType<typeof routes>>;

async function learnerWith(text: string, ip: string) {
  const c = new Client(ip);
  await c.call(r.generate, "/api/identity/generate", { method: "POST" });
  const built = await c.call<{ source: string | null; title: string }>(r.course, "/api/course", { method: "POST", body: { source: "upload", text } });
  expect(built.status).toBe(200);
  const me = await c.call<MeResponse>(r.me, "/api/me");
  const profile = {
    course_title: built.data.title, goal: "Move into a new role", success: "Pass the exam on the first attempt", focus: [], skip: [],
    minutes_per_day: 10, study_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"], deadline: addDays(me.data.today, 14),
    prior_knowledge: "Some formal training in this subject", blocker: "time", blocker_note: "",
  };
  expect((await c.call(r.profile, "/api/profile", { method: "POST", body: { profile } })).status).toBe(200);
  const q = await c.call<{ questions: { question_id: string }[] }>(r.placement.GET, "/api/placement");
  await c.call(r.placement.POST, "/api/placement", { method: "POST", body: { answers: Object.fromEntries(q.data.questions.map((x) => [x.question_id, -1])) } });
  const lesson = await c.call<PresentedLesson>(r.lesson, "/api/lesson");
  expect(lesson.status).toBe(200);
  return { built: built.data, me: me.data, lesson: lesson.data };
}

beforeAll(async () => {
  r = await routes();
});

describe("where a course's passages came from", () => {
  it("a subject typed in a few words is carried as a topic plan to the upload result, /api/me and the lesson", async () => {
    const { built, me, lesson } = await learnerWith("PMP exam", "10.0.8.1");
    expect(built.source).toBe("topic");
    expect(me.course?.source).toBe("topic");
    expect(lesson.source).toBe("topic");
  });

  it("the learner's own text is not marked, so it keeps the 'From your course' label", async () => {
    const { built, me, lesson } = await learnerWith(`${NOTES}\n\n${NOTES.replaceAll("small", "large")}`, "10.0.8.2");
    expect(built.source).toBeNull();
    expect(me.course?.source).toBeNull();
    expect(lesson.source).toBeNull();
    expect(sourceCopy(lesson.source).quoteLabel).toBe("From your course");
  });

  it("a topic plan shows the AI label and never calls the notes your course", () => {
    const words = sourceCopy("topic");
    expect(words.quoteLabel).toBe("From the AI-written notes");
    expect(words.note).toBe("Study notes written by AI for this subject.");
    expect(words.builtFrom("PMP exam")).toBe("Built from study notes written by AI for “PMP exam”. They are not your course.");
    const lines = [words.quoteLabel, words.note, words.writing, words.chatEmpty, words.rereadExcerpt, uploadCopy.waitingLineTopic];
    for (const line of lines) expect(line).not.toMatch(/your course/i);
    expect(uploadCopy.waitingLineTopic).toBe("Writing study notes and building your plan. This can take up to a minute. Keep this page open.");
  });
});
