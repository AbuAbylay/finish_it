// DEV STUB, no model. Builds contract-valid output from the excerpt with fill-in-the-gap questions,
// so the app can be built and tested end to end before the real AI layer (ai/real.ts) lands.
// Signatures match SAGYNDYK-AI.md; the real functions replace these via ai/index.ts.
import type {
  AiError,
  ChatTurn,
  CoursePlan,
  Lesson,
  Order,
  PlacementQuestion,
  Profile,
  Question,
  ValidationResult,
} from "@/lib/types";

const STOPWORDS = new Set(
  "about after again against because before being between could their there these those through under until where which while would other every first also into than then them they this that with from have will what when your".split(
    " ",
  ),
);
const FALLBACK_WORDS = ["schedule", "budget", "quality", "approval", "estimate", "contract", "baseline", "resource"];

function sentences(text: string): string[] {
  const all = (text.match(/[^.!?]+[.!?]+/g) ?? [text]).map((s) => s.trim());
  const long = all.filter((s) => s.split(/\s+/).length >= 6);
  return long.length > 0 ? long : all;
}

function words(text: string): string[] {
  return (text.match(/[A-Za-z][A-Za-z-]{4,}/g) ?? []).filter((w) => !STOPWORDS.has(w.toLowerCase()));
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/** A fill-in-the-gap question on one sentence. The longest content word is the answer. */
function cloze(id: string, sentence: string, pool: string[], concept?: string): Question {
  const candidates = words(sentence);
  const answer = candidates.reduce((a, b) => (b.length > a.length ? b : a), candidates[0] ?? "project");
  const lower = answer.toLowerCase();
  const distractors = [...new Set([...pool, ...FALLBACK_WORDS])]
    .filter((w) => w.toLowerCase() !== lower)
    .sort((a, b) => Math.abs(a.length - answer.length) - Math.abs(b.length - answer.length) || hash(a + id) - hash(b + id))
    .slice(0, 3);
  const correct_index = hash(id + sentence) % 4;
  const options = [...distractors];
  options.splice(correct_index, 0, answer);
  return {
    question_id: id,
    concept: concept ?? answer.toLowerCase(),
    prompt: `Fill the gap: “${sentence.replace(answer, "_____")}”`,
    options,
    correct_index,
    explanation: `Your course says: “${sentence}”`,
    source_quote: sentence,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function writeLesson(order: Order): Promise<Lesson | AiError> {
  await delay(400);
  const { unit } = order;
  const s = sentences(unit.excerpt);
  const pick = (i: number) => s[Math.min(i, s.length - 1)];
  const pool = words(unit.excerpt);

  const opener =
    order.mode === "catch_up" ? "Quick recap" : order.mode === "review" ? "Another way to see it" : "The idea in plain words";
  const sections = [
    { heading: opener, body_md: `**Goal for today:** ${unit.objective}.\n\n${pick(0)} ${pick(1)}`, source_quote: pick(0) },
    {
      heading: "Why it matters for you",
      body_md: `You said your goal is: *${order.learner.goal || "finish this course"}*. Keep that in mind here:\n\n${pick(2)}`,
      source_quote: pick(2),
    },
  ];
  const quizSentences = [s.length - 1, Math.floor(s.length / 2), 1].map((i) => s[Math.max(0, Math.min(i, s.length - 1))]);
  const quiz = quizSentences.map((sentence, i) => cloze(`${unit.unit_id}-q${i + 1}`, sentence, pool));
  const review_quiz = order.review_concepts.map((rc, i) => {
    const rs = sentences(rc.excerpt);
    return cloze(`${unit.unit_id}-r${i + 1}`, rs[i % rs.length], words(rc.excerpt), rc.concept);
  });

  return {
    unit_id: unit.unit_id,
    title: unit.title,
    sections,
    key_points: s.slice(0, 3).map((x) => (x.length > 140 ? `${x.slice(0, 137)}...` : x)),
    quiz,
    review_quiz,
  };
}

export async function setupCourse(materialText: string, profile: Profile | null): Promise<CoursePlan | AiError> {
  await delay(400);
  const paragraphs = materialText
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).length >= 25);
  if (paragraphs.length < 2) return { error: "The material is too short to build a course plan." };
  const chunks = paragraphs.slice(0, 10);
  const units = chunks.map((excerpt, i) => ({
    unit_id: `u${String(i + 1).padStart(2, "0")}`,
    title: excerpt.split(/\s+/).slice(0, 5).join(" ").replace(/[.,;:]$/, ""),
    objective: `Use the ideas in part ${i + 1}`,
    excerpt,
    prerequisites: i === 0 ? [] : [`u${String(i).padStart(2, "0")}`],
  }));
  const step = Math.max(1, Math.floor(units.length / 5));
  const placement_test: PlacementQuestion[] = units
    .filter((_, i) => i % step === 0)
    .slice(0, 5)
    .map((u, i) => ({ ...cloze(`p0${i + 1}`, sentences(u.excerpt)[0], words(u.excerpt)), unit_id: u.unit_id }));
  return { title: profile?.course_title || "Your course", units, placement_test };
}

export async function sideChat(lesson: Lesson, excerpt: string, history: ChatTurn[], question: string): Promise<string | AiError> {
  void lesson;
  void history;
  void question;
  return `The side chat is not connected yet. Here is the part of your course this lesson is built on:\n\n${excerpt.slice(0, 400)}`;
}

export function validatePlan(plan: CoursePlan, materialText: string): ValidationResult {
  const flat = (t: string) => t.replace(/\s+/g, " ").trim();
  const errors = plan.units.filter((u) => !flat(materialText).includes(flat(u.excerpt))).map((u) => `${u.unit_id}: excerpt not found in material`);
  return { ok: errors.length === 0, errors };
}

export function validateLesson(lesson: Lesson, order: Order): ValidationResult {
  const errors = lesson.sections
    .filter((s) => !order.unit.excerpt.includes(s.source_quote))
    .map((s) => `section "${s.heading}": source_quote not in excerpt`);
  return { ok: errors.length === 0, errors };
}
