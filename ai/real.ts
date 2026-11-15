// The real AI layer: the three model calls behind ai/index.ts (docs/INTEGRATION.md).
// Code decides, models write, code checks. Code sets the sizes (how many units a text is split into,
// how many parts and questions a lesson has) and validates every reply before the app sees it. A plan
// with one flawed unit or question is repaired in code; a reply that still fails gets one more try with
// the validator's errors attached; after that the caller gets an AiError, never an exception.
// The prompts are in prompts/*.md so they can be read on their own.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { AiError, ChatTurn, CoursePlan, Lesson, Order, PlacementQuestion, Profile, Question, Unit } from "@/lib/types";
import { FINAL_FAILURES, callModel, type Effort } from "./client";
import {
  LENGTH_RATIO,
  MAX_KEY_POINTS,
  MAX_PLACEMENT_QUESTIONS,
  MAX_QUIZ_QUESTIONS,
  MIN_UNITS,
  countWords,
  cutPassages,
  flat,
  planSize,
  questionErrors,
  snapQuote,
  validateLesson,
  validatePlan,
  wordBudget,
} from "./validate";

export { validateLesson, validatePlan } from "./validate";

// --- settings ---------------------------------------------------------------

const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** One environment variable per model, so a model swap is a one-line change. Only Claude model ids are used. */
function model(name: "SETUP_MODEL" | "LESSON_MODEL" | "CHAT_MODEL", fallback: string): string {
  const value = process.env[name]?.trim();
  return value && value.startsWith("claude-") ? value : fallback;
}

function effort(name: "SETUP_EFFORT" | "LESSON_EFFORT", fallback: Effort): Effort {
  const value = process.env[name]?.trim();
  return EFFORTS.find((e) => e === value) ?? fallback;
}

/** Time limits per call, kept under each route's maxDuration (60 s for setup and lesson, 30 s for chat). */
const BUDGET_MS = { setup: 55_000, lesson: 50_000, chat: 25_000 };
/** A lesson takes 13 to 25 s, longer for longer sessions. Capping the first try leaves time for a second one. */
const LESSON_FIRST_TRY_MS = 38_000;
const CHAT_FIRST_TRY_MS = 15_000;
/** A second try is not started with less time than this left. */
const MIN_RETRY_MS = 8_000;
/** Two lessons cannot be cut from less text than this. The upload route asks for the same (lib/upload.ts), so learners meet that limit first. */
const MIN_MATERIAL_CHARS = 900;
const MAX_HISTORY_TURNS = 12;

const SORRY = {
  setup: "We could not build a study plan from this material. Please try again.",
  short: "This text is too short to build a plan from. Paste at least half a page of your course.",
  lesson: "The lesson could not be written. Please try again.",
  chat: "The chat could not answer just now. Please try again.",
};

const prompts = new Map<string, string>();

async function prompt(name: "setup" | "lesson" | "side-chat"): Promise<string> {
  const cached = prompts.get(name);
  if (cached) return cached;
  const text = (await readFile(path.join(process.cwd(), "prompts", `${name}.md`), "utf8")).trim();
  prompts.set(name, text);
  return text;
}

// --- what the models return ---------------------------------------------------
// Structured outputs guarantee these shapes. Counts, quotes and lengths are checked by ai/validate.ts,
// because its error messages are what the second try is given.

const questionOut = z.object({
  concept: z.string(),
  prompt: z.string(),
  options: z.array(z.string()).describe("Exactly four options"),
  correct_index: z.number().describe("Position of the correct option: 0, 1, 2 or 3"),
  explanation: z.string(),
  source_quote: z.string(),
});

const planOut = z.object({
  title: z.string(),
  units: z.array(
    z.object({
      unit_id: z.string(),
      title: z.string(),
      objective: z.string(),
      start_quote: z.string().describe("First 6 to 12 words of the unit's passage, copied exactly from the material"),
      end_quote: z.string().describe("Last 6 to 12 words of the unit's passage, copied exactly from the material"),
      prerequisites: z.array(z.string()),
    }),
  ),
  placement_test: z.array(questionOut.extend({ unit_id: z.string() })),
});

const lessonOut = z.object({
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body_md: z.string(), source_quote: z.string() })),
  key_points: z.array(z.string()),
  quiz: z.array(questionOut),
  review_quiz: z.array(questionOut),
});

type Accepted<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function schemaErrors(error: z.ZodError): string[] {
  return [`the reply does not match the schema: ${error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`];
}

/** A question in the app's shape. Its quote is replaced by the exact words of the source when they can be found. */
function question(q: z.infer<typeof questionOut>, id: string, source: string): Question {
  return {
    question_id: id,
    concept: q.concept.trim(),
    prompt: q.prompt.trim(),
    options: q.options.map((o) => o.trim()),
    correct_index: q.correct_index,
    explanation: q.explanation.trim(),
    source_quote: snapQuote(q.source_quote, source) ?? q.source_quote.trim(),
  };
}

// --- one checked call, at most two tries --------------------------------------

function retryNote(errors: string[]): string {
  return [
    "An earlier answer to this request was rejected by the code that checks it.",
    "Write the whole answer again and avoid these problems:",
    ...errors.slice(0, 12).map((e) => `- ${e}`),
  ].join("\n");
}

async function checked<T>(job: {
  call: "setup" | "lesson";
  model: string;
  effort: Effort;
  system: string;
  user: string;
  schema: z.ZodType;
  maxTokens: number;
  budgetMs: number;
  firstTryMs?: number;
  /** Turns the model's JSON into the app's shape, or lists what is wrong with it. */
  accept: (raw: unknown) => Accepted<T>;
  sorry: string;
}): Promise<T | AiError> {
  const deadline = Date.now() + job.budgetMs;
  let errors: string[] = [];
  let detail = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const left = deadline - Date.now();
    if (attempt === 2 && left < MIN_RETRY_MS) {
      detail += " (no time left for a second try)";
      break;
    }
    const reply = await callModel({
      call: job.call,
      model: job.model,
      effort: job.effort,
      system: job.system,
      messages: [{ role: "user", content: errors.length === 0 ? job.user : `${job.user}\n\n${retryNote(errors)}` }],
      schema: job.schema,
      maxTokens: job.maxTokens,
      timeoutMs: attempt === 1 ? Math.min(job.firstTryMs ?? left, left) : left,
    });
    if (!reply.ok) {
      detail = `try ${attempt}: ${reply.detail}`;
      if (FINAL_FAILURES.includes(reply.reason)) break;
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(reply.text);
    } catch {
      errors = ["the reply was not valid JSON"];
      detail = `try ${attempt}: ${errors[0]}`;
      continue;
    }
    const result = job.accept(raw);
    if (result.ok) return result.value;
    errors = result.errors;
    detail = `try ${attempt}: ${errors.join("; ")}`;
    // What the validator turned down, for the server log: this is how prompt problems show up.
    console.warn(`ai ${job.call}: reply rejected (${detail})`);
  }
  return { error: job.sorry, detail };
}

// --- setup call ---------------------------------------------------------------

function planFrom(raw: unknown, material: string, profile: Profile | null): Accepted<CoursePlan> {
  const parsed = planOut.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error) };
  const out = parsed.data;

  // Code cuts every passage out of the material. A unit whose marks were miscopied is re-cut from its
  // neighbours; one that still has no usable passage is left out, so one bad mark never costs the plan.
  const passages = cutPassages(material, out.units);
  const kept = out.units.flatMap((u, i) => {
    const excerpt = passages[i];
    return excerpt === null ? [] : [{ ...u, excerpt }];
  });
  if (kept.length < MIN_UNITS) {
    return {
      ok: false,
      errors: [`only ${kept.length} of the ${out.units.length} passages could be found in the material; copy start_quote and end_quote exactly as they appear there`],
    };
  }

  const idOf = (i: number) => `u${String(i + 1).padStart(2, "0")}`;
  // Units are renumbered in plan order; the model's own ids are only used to resolve references.
  const renumbered = new Map<string, string>();
  kept.forEach((u, i) => {
    if (!renumbered.has(u.unit_id)) renumbered.set(u.unit_id, idOf(i));
  });
  const units: Unit[] = kept.map((u, i) => {
    const unit_id = idOf(i);
    const title = u.title.trim() || `Topic ${i + 1}`;
    return {
      unit_id,
      title,
      objective: u.objective.trim() || title,
      excerpt: u.excerpt,
      prerequisites: u.prerequisites.flatMap((p) => {
        const id = renumbered.get(p);
        return id && id < unit_id ? [id] : [];
      }),
    };
  });

  // The placement test keeps the questions that are sound: on a unit of the plan, one per unit, four
  // different options, a quote found in the unit's passage. A flawed question is left out, not sent back.
  const sound: PlacementQuestion[] = [];
  for (const q of out.placement_test) {
    const unit = units.find((u) => u.unit_id === (renumbered.get(q.unit_id) ?? q.unit_id));
    if (!unit || sound.some((s) => s.unit_id === unit.unit_id)) continue;
    const built = { ...question(q, "", unit.excerpt), unit_id: unit.unit_id };
    if (questionErrors(built, unit.excerpt, "", Number.POSITIVE_INFINITY).length === 0) sound.push(built);
  }
  // A correct option that stands out by length gives the answer away. Such questions go too, while three others remain.
  const even = sound.filter((q) => questionErrors(q, units.find((u) => u.unit_id === q.unit_id)?.excerpt ?? "", "", LENGTH_RATIO.strict).length === 0);
  const placement_test = (even.length >= Math.min(3, sound.length) ? even : sound)
    .slice(0, MAX_PLACEMENT_QUESTIONS)
    .map((q, i) => ({ ...q, question_id: `p${String(i + 1).padStart(2, "0")}` }));
  if (placement_test.length === 0) {
    return {
      ok: false,
      errors: ["no placement question could be used: each needs four different options, one correct_index and a source_quote copied exactly from its unit's passage"],
    };
  }

  const plan: CoursePlan = { title: profile?.course_title.trim() || out.title.trim() || "Your course", units, placement_test };
  const check = validatePlan(plan, material);
  return check.ok ? { ok: true, value: plan } : { ok: false, errors: check.errors };
}

export async function setupCourse(materialText: string, profile: Profile | null): Promise<CoursePlan | AiError> {
  try {
    const material = materialText.replace(/\r\n?/g, "\n").normalize("NFC").trim();
    if (material.length < MIN_MATERIAL_CHARS) return { error: SORRY.short, detail: `material has ${material.length} characters` };
    const learner = profile && {
      course_title: profile.course_title,
      goal: profile.goal,
      focus: profile.focus,
      skip: profile.skip,
      prior_knowledge: profile.prior_knowledge,
    };
    return await checked<CoursePlan>({
      call: "setup",
      model: model("SETUP_MODEL", "claude-haiku-5-5"),
      effort: effort("SETUP_EFFORT", "low"),
      system: await prompt("setup"),
      // Code sets the size of the plan from the length of the text; the model fills it.
      user: `<profile>\n${JSON.stringify(learner, null, 2)}\n</profile>\n\n<plan_size>\n${JSON.stringify(planSize(countWords(material)))}\n</plan_size>\n\n<material>\n${material}\n</material>`,
      schema: planOut,
      maxTokens: 12_000,
      budgetMs: BUDGET_MS.setup,
      accept: (raw) => planFrom(raw, material, profile),
      sorry: SORRY.setup,
    });
  } catch (err) {
    return { error: SORRY.setup, detail: err instanceof Error ? err.message : String(err) };
  }
}

// --- lesson call --------------------------------------------------------------

function lessonFrom(raw: unknown, order: Order): Accepted<Lesson> {
  const parsed = lessonOut.safeParse(raw);
  if (!parsed.success) return { ok: false, errors: schemaErrors(parsed.error) };
  const out = parsed.data;
  const { unit } = order;
  const excerpt = flat(unit.excerpt);

  // A section whose quote is not in the excerpt is dropped (SAGYNDYK-AI.md "Validator").
  const sections = out.sections
    .map((s) => ({ heading: s.heading.trim(), body_md: s.body_md.trim(), source_quote: snapQuote(s.source_quote, unit.excerpt) ?? s.source_quote.trim() }))
    .filter((s) => s.source_quote !== "" && excerpt.includes(flat(s.source_quote)));
  if (sections.length === 0) return { ok: false, errors: ["no section has a source_quote that is word for word in unit.excerpt"] };

  // Each review question is paired with its concept: first every question whose name matches a concept,
  // then the rest in order. It takes the concept's exact name, which is what the grader looks for.
  const unused = [...out.review_quiz];
  const named = order.review_concepts.map((rc) => {
    const at = unused.findIndex((q) => flat(q.concept) === flat(rc.concept));
    return at === -1 ? null : unused.splice(at, 1)[0];
  });
  const review_quiz = order.review_concepts.flatMap((rc, i) => {
    const q = named[i] ?? unused.shift();
    return q ? [{ ...question(q, `${unit.unit_id}-r${i + 1}`, rc.excerpt), concept: rc.concept }] : [];
  });

  const lesson: Lesson = {
    unit_id: unit.unit_id,
    title: out.title.trim() || unit.title,
    sections,
    key_points: out.key_points.map((k) => k.trim()).filter((k) => k !== "").slice(0, MAX_KEY_POINTS),
    quiz: out.quiz.slice(0, MAX_QUIZ_QUESTIONS).map((q, i) => question(q, `${unit.unit_id}-q${i + 1}`, unit.excerpt)),
    review_quiz,
  };
  const errors = validateLesson(lesson, order).errors;
  if (unused.length > 0) errors.push(`review_quiz has ${out.review_quiz.length} questions; it needs exactly ${order.review_concepts.length}`);
  return errors.length === 0 ? { ok: true, value: lesson } : { ok: false, errors };
}

export async function writeLesson(order: Order): Promise<Lesson | AiError> {
  try {
    const budget = wordBudget(order.minutes);
    // The model gets what the order contains plus the shape it must fill: which parts to write, how long,
    // how many questions. Code sets that shape from the minutes. `why` is written by code for the page.
    const brief = {
      mode: order.mode,
      minutes: order.minutes,
      target_words: budget.target,
      max_words: budget.max,
      sections: budget.sections,
      parts: budget.parts,
      quiz_questions: budget.quiz,
      unit: order.unit,
      learner: order.learner,
      review_concepts: order.review_concepts,
    };
    return await checked<Lesson>({
      call: "lesson",
      model: model("LESSON_MODEL", "claude-sonnet-5-5"),
      effort: effort("LESSON_EFFORT", "medium"),
      system: await prompt("lesson"),
      user: `<order>\n${JSON.stringify(brief, null, 2)}\n</order>`,
      schema: lessonOut,
      maxTokens: 12_000,
      budgetMs: BUDGET_MS.lesson,
      firstTryMs: LESSON_FIRST_TRY_MS,
      accept: (raw) => lessonFrom(raw, order),
      sorry: SORRY.lesson,
    });
  } catch (err) {
    return { error: SORRY.lesson, detail: err instanceof Error ? err.message : String(err) };
  }
}

// --- side chat ------------------------------------------------------------------

export async function sideChat(lesson: Lesson, excerpt: string, history: ChatTurn[], question: string): Promise<string | AiError> {
  try {
    // The app passes the quiz only once the lesson is graded; until then the model never sees a question or an answer.
    const answered = [...lesson.quiz, ...lesson.review_quiz].map((q) => ({
      prompt: q.prompt,
      options: q.options,
      correct_option: q.options[q.correct_index],
      explanation: q.explanation,
    }));
    const open = {
      title: lesson.title,
      sections: lesson.sections.map((s) => ({ heading: s.heading, body_md: s.body_md })),
      key_points: lesson.key_points,
      ...(answered.length > 0 ? { answered_quiz: answered } : {}),
    };
    const system = `${await prompt("side-chat")}\n\n<lesson>\n${JSON.stringify(open, null, 2)}\n</lesson>\n\n<excerpt>\n${excerpt}\n</excerpt>`;
    const turns = history.filter((t) => t.content.trim() !== "").slice(-MAX_HISTORY_TURNS);
    while (turns.length > 0 && turns[0].role !== "user") turns.shift();
    const messages = [...turns.map((t) => ({ role: t.role, content: t.content })), { role: "user" as const, content: question }];

    const deadline = Date.now() + BUDGET_MS.chat;
    let detail = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      const left = deadline - Date.now();
      if (attempt === 2 && left < MIN_RETRY_MS) break;
      const reply = await callModel({
        call: "chat",
        model: model("CHAT_MODEL", "claude-haiku-5-5"),
        effort: "low",
        system,
        messages,
        maxTokens: 2_000,
        timeoutMs: attempt === 1 ? Math.min(CHAT_FIRST_TRY_MS, left) : left,
      });
      if (reply.ok) return reply.text.trim();
      detail = `try ${attempt}: ${reply.detail}`;
      if (FINAL_FAILURES.includes(reply.reason)) break;
    }
    return { error: SORRY.chat, detail };
  } catch (err) {
    return { error: SORRY.chat, detail: err instanceof Error ? err.message : String(err) };
  }
}
