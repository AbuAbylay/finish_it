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
function cloze(id: string, sentence: string, pool: string[], concept?: string, forced?: string): Question {
  const candidates = words(sentence);
  const answer = forced ?? candidates.reduce((a, b) => (b.length > a.length ? b : a), candidates[0] ?? "project");
  const lower = answer.toLowerCase();
  const unique = new Map([...pool, ...FALLBACK_WORDS].map((w) => [w.toLowerCase(), w]));
  unique.delete(lower);
  const distractors = [...unique.values()]
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
    explanation: `The course uses “${answer}” in this sentence.`,
    source_quote: sentence,
  };
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The sentence of an excerpt that contains a concept word, and that word as written there. */
function findConcept(excerpt: string, concept: string): { sentence: string; word: string } | null {
  const escaped = concept.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return null;
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  for (const sentence of sentences(excerpt)) {
    const m = re.exec(sentence);
    if (m) return { sentence, word: m[0] };
  }
  return null;
}

export async function writeLesson(order: Order): Promise<Lesson | AiError> {
  await delay(400);
  const { unit } = order;
  const s = sentences(unit.excerpt);
  const n = s.length;
  const at = (i: number) => s[((i % n) + n) % n];
  const pool = words(unit.excerpt);
  // Each mode starts from a different sentence, so a review or catch-up does not repeat the earlier questions.
  const shift = order.mode === "new" ? 0 : order.mode === "review" ? 1 : 2;

  const opener =
    order.mode === "catch_up" ? "Quick recap" : order.mode === "review" ? "Another way to see it" : "The idea in plain words";
  const sections = [
    { heading: opener, body_md: `**Goal for today:** ${unit.objective}.\n\n${at(shift + 1)}`, source_quote: at(shift) },
    { heading: "In your course", body_md: at(shift + 3), source_quote: at(shift + 2) },
  ];

  const picked: string[] = [];
  for (const i of [n - 1, Math.floor(n / 2), 1, 0, 2, 3, 4]) {
    const sentence = at(i + shift);
    if (!picked.includes(sentence)) picked.push(sentence);
    if (picked.length === 3) break;
  }
  while (picked.length < 3) picked.push(at(picked.length));
  const quiz = picked.map((sentence, i) => cloze(`${unit.unit_id}-q${i + 1}`, sentence, pool));

  // A review question asks about the concept that was missed, in the sentence where it appears.
  const review_quiz = order.review_concepts.map((rc, i) => {
    const hit = findConcept(rc.excerpt, rc.concept);
    const rs = sentences(rc.excerpt);
    return hit
      ? cloze(`${unit.unit_id}-r${i + 1}`, hit.sentence, words(rc.excerpt), rc.concept, hit.word)
      : cloze(`${unit.unit_id}-r${i + 1}`, rs[i % rs.length], words(rc.excerpt), rc.concept);
  });

  return {
    unit_id: unit.unit_id,
    title: unit.title,
    sections,
    key_points: [`${unit.objective}.`, `Words to know: ${quiz.map((q) => q.options[q.correct_index]).join(", ")}.`],
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

export async function sideChat(lesson: Lesson, excerpt: string, history: ChatTurn[], question: string, source?: "course" | "topic"): Promise<string | AiError> {
  void lesson;
  void history;
  void question;
  const material = source === "topic" ? "these notes" : "your course";
  return `The side chat is not connected yet. Here is the part of ${material} this lesson is built on:\n\n${excerpt.slice(0, 400)}`;
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
