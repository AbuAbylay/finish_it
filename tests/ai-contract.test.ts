// Contract test for the AI layer (docs/INTEGRATION.md). Any setupCourse / writeLesson output must pass
// the shapes in PROJECT §4 and the app's own rules before the app will render or grade it.
//   npx vitest run tests/ai-contract.test.ts                     -> the stub (+ recorded outputs)
//   AI_CONTRACT_LIVE=1 npx vitest run tests/ai-contract.test.ts  -> also the active ai/index.ts implementation (real calls)
// Recorded outputs: tests/fixtures/ai/*.json as { "kind": "lesson", "order": Order, "lesson": Lesson }
// or { "kind": "plan", "material_file": "sample/course.txt", "plan": CoursePlan }.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import * as active from "@/ai";
import * as stub from "@/ai/stub";
import { parseCoursePlan, parseLesson } from "@/lib/contracts";
import { isAiError, type CoursePlan, type Lesson, type Order, type Question } from "@/lib/types";

vi.mock("server-only", () => ({}));

const LIVE = process.env.AI_CONTRACT_LIVE === "1";
const isReal = active.writeLesson !== stub.writeLesson;
const flat = (t: string) => t.replace(/\s+/g, " ").trim();
const root = path.resolve(__dirname, "..");

const materialFile = existsSync(path.join(root, "sample/course.txt")) ? "sample/course.txt" : "sample/dev-course.txt";
const material = readFileSync(path.join(root, materialFile), "utf8");
const planFile = existsSync(path.join(root, "sample/course-plan.json")) ? "sample/course-plan.json" : "sample/dev-course-plan.json";
const samplePlan = JSON.parse(readFileSync(path.join(root, planFile), "utf8")) as CoursePlan;

function expectQuestion(q: Question, excerpt: string, where: string) {
  expect(q.options, `${where}: 4 options`).toHaveLength(4);
  expect(Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3, `${where}: correct_index 0..3`).toBe(true);
  expect(q.source_quote.trim().length, `${where}: source_quote present`).toBeGreaterThan(0);
  expect(flat(excerpt).includes(flat(q.source_quote)), `${where}: source_quote is in the excerpt`).toBe(true);
  expect(q.concept.trim().length, `${where}: concept present`).toBeGreaterThan(0);
}

export function expectValidPlan(plan: unknown, materialText: string) {
  const parsed = parseCoursePlan(plan);
  expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
  if (!parsed.ok) return;
  const p = parsed.plan;
  expect(p.units.length).toBeGreaterThanOrEqual(6);
  expect(p.units.length).toBeLessThanOrEqual(10);
  for (const u of p.units) expect(flat(materialText).includes(flat(u.excerpt)), `${u.unit_id}: excerpt is a verbatim span`).toBe(true);
  expect(p.placement_test).toHaveLength(5);
  expect(new Set(p.placement_test.map((q) => q.unit_id)).size, "5 different units").toBe(5);
  for (const q of p.placement_test) {
    const unit = p.units.find((u) => u.unit_id === q.unit_id);
    expect(unit, `${q.question_id}: unit exists`).toBeDefined();
    expectQuestion(q, unit!.excerpt, q.question_id);
  }
}

export async function expectValidLesson(lesson: unknown, order: Order) {
  const parsed = parseLesson(lesson);
  expect(parsed.ok, parsed.ok ? "" : parsed.error).toBe(true);
  if (!parsed.ok) return;
  const l: Lesson = parsed.lesson;
  expect(l.unit_id).toBe(order.unit.unit_id);
  expect(l.quiz, "3 quiz questions").toHaveLength(3);
  expect(l.review_quiz, "one review question per review concept").toHaveLength(order.review_concepts.length);
  expect(l.key_points.length).toBeLessThanOrEqual(3);
  for (const s of l.sections) {
    expect(flat(order.unit.excerpt).includes(flat(s.source_quote)), `section "${s.heading}": source_quote is in the excerpt`).toBe(true);
  }
  l.quiz.forEach((q, i) => expectQuestion(q, order.unit.excerpt, `quiz[${i}]`));
  l.review_quiz.forEach((q, i) => {
    const rc = order.review_concepts.find((c) => flat(c.concept) === flat(q.concept)) ?? order.review_concepts[i];
    expectQuestion(q, rc.excerpt, `review_quiz[${i}]`);
  });
  // What the browser receives before an answer is submitted carries no answer key.
  const { presentLesson } = await import("@/lib/server");
  const shown = presentLesson("k", order, l, null);
  for (const q of [...shown.lesson.quiz, ...shown.lesson.review_quiz]) {
    expect(Object.keys(q).sort()).toEqual(["concept", "options", "prompt", "question_id"]);
  }
  expect(shown.checked).toEqual({});
}

function orders(plan: CoursePlan): Order[] {
  const [a, b, , d] = plan.units;
  const learner = { goal: "Move into a project manager role", focus: [plan.units[1].title], prior_knowledge: "Leads projects, self-taught" };
  const unit = (u: CoursePlan["units"][number]) => ({ unit_id: u.unit_id, title: u.title, objective: u.objective, excerpt: u.excerpt });
  return [
    { mode: "new", minutes: 15, unit: unit(d), learner, review_concepts: [], why: "Next up." },
    { mode: "review", minutes: 15, unit: unit(b), learner, review_concepts: [{ concept: plan.placement_test[0].concept, unit_id: a.unit_id, excerpt: a.excerpt }], why: "Review." },
    {
      mode: "catch_up",
      minutes: 10,
      unit: unit(b),
      learner,
      review_concepts: [
        { concept: plan.placement_test[0].concept, unit_id: a.unit_id, excerpt: a.excerpt },
        { concept: plan.placement_test[1].concept, unit_id: b.unit_id, excerpt: b.excerpt },
      ],
      why: "Catch-up.",
    },
  ];
}

const implementations: [string, typeof stub][] = [["stub", stub]];
if (isReal && LIVE) implementations.push(["real (ai/index.ts)", active as typeof stub]);

describe.each(implementations)("AI contract: %s", (_name, impl) => {
  it("setupCourse returns a valid course plan for the sample material", { timeout: 120_000 }, async () => {
    const plan = await impl.setupCourse(material, null);
    expect(isAiError(plan), isAiError(plan) ? plan.error : "").toBe(false);
    expectValidPlan(plan, material);
  });

  it.each(orders(samplePlan).map((o) => [o.mode, o] as const))("writeLesson returns a valid %s lesson", { timeout: 120_000 }, async (_mode, order) => {
    const lesson = await impl.writeLesson(order);
    expect(isAiError(lesson), isAiError(lesson) ? lesson.error : "").toBe(false);
    await expectValidLesson(lesson, order);
  });
});

describe("AI contract: recorded outputs in tests/fixtures/ai", () => {
  const dir = path.join(root, "tests/fixtures/ai");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  it.skipIf(files.length > 0)("no recorded outputs yet (drop JSON files in tests/fixtures/ai)", () => {});
  for (const f of files) {
    it(f, async () => {
      const fx = JSON.parse(readFileSync(path.join(dir, f), "utf8")) as
        | { kind: "lesson"; order: Order; lesson: unknown }
        | { kind: "plan"; material_file: string; plan: unknown };
      if (fx.kind === "lesson") await expectValidLesson(fx.lesson, fx.order);
      else expectValidPlan(fx.plan, readFileSync(path.join(root, fx.material_file), "utf8"));
    });
  }
});
