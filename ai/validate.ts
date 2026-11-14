// The checks every model output must pass before the app sees it (SAGYNDYK-AI.md "Validator").
// Plain code: no model and no network, so every rule here is unit-tested directly.
import type { CoursePlan, Lesson, Order, Question, ValidationResult } from "@/lib/types";

export const MIN_UNITS = 6;
export const MAX_UNITS = 10;
export const PLACEMENT_QUESTIONS = 5;
export const QUIZ_QUESTIONS = 3;
export const MAX_SECTIONS = 4;
export const MAX_KEY_POINTS = 3;
/** An excerpt is "at most about 600 words" (PROJECT §4.2). Longer spans are cut back to this. */
export const MAX_EXCERPT_WORDS = 600;
/** The validator allows a little slack above the cut, for a final sentence that runs over. */
const EXCERPT_WORD_LIMIT = 700;

// --- text matching ----------------------------------------------------------

const SINGLE_QUOTES = /[‘’‚‛]/g;
const DOUBLE_QUOTES = /[“”„‟]/g;
const DASHES = /[‐-―]/g;

function fold(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(SINGLE_QUOTES, "'").replace(DOUBLE_QUOTES, '"').replace(DASHES, "-");
}

/**
 * Text as the validator compares it: NFKC, lower case, one style of quotes and dashes, single spaces.
 * A quote "appears word for word" when its flat form is inside the flat form of the excerpt.
 */
export function flat(text: string): string {
  return fold(text).replace(/\s+/g, " ").trim();
}

export function countWords(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

/** The flat form of a text, plus where each of its characters came from in the original. */
function flatWithMap(text: string): { text: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  for (let i = 0; i < text.length; ) {
    const char = String.fromCodePoint(text.codePointAt(i) as number);
    for (const c of fold(char)) {
      if (/\s/.test(c)) {
        if (out !== "" && !out.endsWith(" ")) {
          out += " ";
          map.push(i);
        }
      } else {
        out += c;
        // One entry per UTF-16 unit of the output, so string positions and map positions stay the same thing
        // even after a character outside the basic plane (an emoji, for example).
        for (let k = 0; k < c.length; k++) map.push(i);
      }
    }
    i += char.length;
  }
  if (out.endsWith(" ")) {
    out = out.slice(0, -1);
    map.pop();
  }
  return { text: out, map };
}

/** Where `needle` sits in `haystack` (positions in the original string), ignoring case, spacing and quote style. */
export function locate(haystack: string, needle: string, from = 0): { start: number; end: number } | null {
  const target = flatWithMap(needle).text;
  if (target === "") return null;
  const h = flatWithMap(haystack);
  let at = h.text.indexOf(target);
  while (at !== -1 && h.map[at] < from) at = h.text.indexOf(target, at + 1);
  if (at === -1) return null;
  const last = h.map[at + target.length - 1];
  return { start: h.map[at], end: last + String.fromCodePoint(haystack.codePointAt(last) as number).length };
}

/**
 * The exact words of the source for a quote the model copied: the same span as written in `source`,
 * or null when the quote is not there. Tolerates quotation marks, an ellipsis or a full stop the
 * model added around the quote.
 */
export function snapQuote(quote: string, source: string): string | null {
  const ellipsis = /^(?:\s|…|\.{3})+|(?:\s|…|\.{3})+$/g;
  const marks = /^[\s"'‘-‟]+|[\s"'‘-‟]+$/g;
  const punctuation = /^[\s"'‘-‟.,;:!?…]+|[\s"'‘-‟.,;:!?…]+$/g;
  const bare = quote.replace(ellipsis, "");
  for (const candidate of [quote, bare, bare.replace(marks, ""), bare.replace(punctuation, "")]) {
    const hit = locate(source, candidate);
    if (hit && hit.end > hit.start) return source.slice(hit.start, hit.end);
  }
  return null;
}

/** Cuts a text back to at most `maxWords` words, ending on a paragraph or sentence where one exists. */
export function trimToWords(text: string, maxWords: number): string {
  if (countWords(text) <= maxWords) return text;
  const pieces = text.match(/\S+\s*/g) ?? [];
  const head = pieces.slice(0, maxWords).join("");
  const paragraph = head.lastIndexOf("\n\n");
  if (paragraph > head.length / 2) return head.slice(0, paragraph).trim();
  const sentence = Math.max(head.lastIndexOf(". "), head.lastIndexOf(".\n"), head.lastIndexOf("? "), head.lastIndexOf("! "));
  return (sentence > head.length / 2 ? head.slice(0, sentence + 1) : head).trim();
}

/**
 * The setup call names each unit's passage by its first and last words; code cuts the passage out
 * of the material, so an excerpt is a verbatim span by construction and the model never retypes it.
 */
export function cutExcerpt(
  material: string,
  startQuote: string,
  endQuote: string,
  from = 0,
): { ok: true; excerpt: string; end: number } | { ok: false; error: string } {
  const start = locate(material, startQuote, from) ?? locate(material, startQuote);
  if (!start) return { ok: false, error: "start_quote is not in the material; copy the first words of the passage exactly" };
  const end = locate(material, endQuote, start.start);
  if (!end) return { ok: false, error: "end_quote is not in the material after start_quote; copy the last words of the passage exactly" };
  const excerpt = trimToWords(material.slice(start.start, end.end).trim(), MAX_EXCERPT_WORDS);
  return { ok: true, excerpt, end: end.end };
}

// --- lesson length ----------------------------------------------------------

/**
 * Reading time is the session minus about 4 minutes for the quiz (PROJECT §4.4).
 * The lesson call aims for `target` words and may never pass `max` = (minutes - 4) x 60.
 */
export function wordBudget(minutes: number): { target: number; max: number; sections: number } {
  const reading = Math.max(minutes, 8) - 4;
  return { target: reading * 30, max: reading * 60, sections: minutes <= 10 ? 2 : minutes <= 20 ? 3 : 4 };
}

// --- questions --------------------------------------------------------------

/**
 * Four distinct options, one correct index, a quote found in the source, and a correct option that
 * does not stand out by length: its length against the mean of the other three stays between
 * 0.5 and 1.5 (not applied when every option is shorter than 20 characters).
 */
export function questionErrors(q: Question, source: string, where: string): string[] {
  const errors: string[] = [];
  const options = Array.isArray(q.options) ? q.options : [];
  if (options.length !== 4) errors.push(`${where}: needs exactly 4 options, has ${options.length}`);
  if (options.some((o) => typeof o !== "string" || o.trim() === "")) errors.push(`${where}: every option needs text`);
  if (new Set(options.map((o) => flat(String(o)))).size !== options.length) errors.push(`${where}: options must differ from each other`);
  const indexOk = Number.isInteger(q.correct_index) && q.correct_index >= 0 && q.correct_index <= 3;
  if (!indexOk) errors.push(`${where}: correct_index must be 0, 1, 2 or 3`);
  for (const field of ["prompt", "concept", "explanation"] as const) {
    if (typeof q[field] !== "string" || q[field].trim() === "") errors.push(`${where}: ${field} is empty`);
  }
  if (typeof q.source_quote !== "string" || q.source_quote.trim() === "") {
    errors.push(`${where}: source_quote is empty`);
  } else if (!flat(source).includes(flat(q.source_quote))) {
    errors.push(`${where}: source_quote is not word for word in its excerpt`);
  }
  if (indexOk && options.length === 4 && options.some((o) => String(o).length >= 20)) {
    const others = options.filter((_, i) => i !== q.correct_index);
    const ratio = options[q.correct_index].length / (others.reduce((n, o) => n + o.length, 0) / others.length);
    if (!(ratio > 0.5 && ratio < 1.5)) {
      errors.push(`${where}: the correct option stands out by length (${ratio.toFixed(2)} times the others); make all four the same length and form`);
    }
  }
  return errors;
}

// --- course plan ------------------------------------------------------------

export function validatePlan(plan: CoursePlan, materialText: string): ValidationResult {
  const errors: string[] = [];
  const units = Array.isArray(plan.units) ? plan.units : [];
  const placement = Array.isArray(plan.placement_test) ? plan.placement_test : [];
  if (typeof plan.title !== "string" || plan.title.trim() === "") errors.push("title is empty");
  if (units.length < MIN_UNITS || units.length > MAX_UNITS) errors.push(`the plan needs ${MIN_UNITS} to ${MAX_UNITS} units, has ${units.length}`);
  const ids = new Set(units.map((u) => u.unit_id));
  if (ids.size !== units.length) errors.push("unit_id values must be unique");
  const material = flat(materialText);
  for (const u of units) {
    if (!u.title?.trim()) errors.push(`${u.unit_id}: title is empty`);
    if (!u.objective?.trim()) errors.push(`${u.unit_id}: objective is empty`);
    if (!u.excerpt?.trim()) errors.push(`${u.unit_id}: excerpt is empty`);
    else if (!material.includes(flat(u.excerpt))) errors.push(`${u.unit_id}: excerpt is not a word-for-word span of the material`);
    else if (countWords(u.excerpt) > EXCERPT_WORD_LIMIT) errors.push(`${u.unit_id}: excerpt is longer than ${MAX_EXCERPT_WORDS} words`);
  }
  if (placement.length !== PLACEMENT_QUESTIONS) errors.push(`the placement test needs ${PLACEMENT_QUESTIONS} questions, has ${placement.length}`);
  if (new Set(placement.map((q) => q.unit_id)).size !== placement.length) errors.push("each placement question must be on a different unit");
  for (const q of placement) {
    const unit = units.find((u) => u.unit_id === q.unit_id);
    if (!unit) errors.push(`${q.question_id}: unit ${q.unit_id} is not in the plan`);
    else errors.push(...questionErrors(q, unit.excerpt ?? "", q.question_id));
  }
  return { ok: errors.length === 0, errors };
}

// --- lesson -----------------------------------------------------------------

export function validateLesson(lesson: Lesson, order: Order): ValidationResult {
  const errors: string[] = [];
  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
  const quiz = Array.isArray(lesson.quiz) ? lesson.quiz : [];
  const review = Array.isArray(lesson.review_quiz) ? lesson.review_quiz : [];
  const keyPoints = Array.isArray(lesson.key_points) ? lesson.key_points : [];
  const excerpt = order.unit.excerpt;

  if (lesson.unit_id !== order.unit.unit_id) errors.push(`unit_id must be ${order.unit.unit_id}`);
  if (typeof lesson.title !== "string" || lesson.title.trim() === "") errors.push("title is empty");
  if (sections.length < 1 || sections.length > MAX_SECTIONS) errors.push(`a lesson has 1 to ${MAX_SECTIONS} sections, this one has ${sections.length}`);
  sections.forEach((s, i) => {
    const where = `sections[${i}]`;
    if (!s.body_md?.trim()) errors.push(`${where}: body_md is empty`);
    if (!s.source_quote?.trim()) errors.push(`${where}: source_quote is empty`);
    else if (!flat(excerpt).includes(flat(s.source_quote))) errors.push(`${where}: source_quote is not word for word in the excerpt`);
  });
  const words = sections.reduce((n, s) => n + countWords(s.body_md ?? ""), 0);
  const { max } = wordBudget(order.minutes);
  if (words > max) errors.push(`the sections have ${words} words; the limit for ${order.minutes} minutes is ${max}`);
  if (keyPoints.length > MAX_KEY_POINTS) errors.push(`key_points has ${keyPoints.length} lines; at most ${MAX_KEY_POINTS}`);

  if (quiz.length !== QUIZ_QUESTIONS) errors.push(`quiz needs exactly ${QUIZ_QUESTIONS} questions, has ${quiz.length}`);
  quiz.forEach((q, i) => errors.push(...questionErrors(q, excerpt, `quiz[${i}]`)));

  const concepts = order.review_concepts;
  if (review.length !== concepts.length) {
    errors.push(`review_quiz needs one question per review concept (${concepts.length}), has ${review.length}`);
  } else {
    review.forEach((q, i) => {
      const where = `review_quiz[${i}]`;
      if (flat(q.concept ?? "") !== flat(concepts[i].concept)) errors.push(`${where}: concept must be "${concepts[i].concept}", unchanged`);
      errors.push(...questionErrors(q, concepts[i].excerpt, where));
    });
  }
  const questionIds = [...quiz, ...review].map((q) => q.question_id);
  if (new Set(questionIds).size !== questionIds.length) errors.push("question_id values must be unique within the lesson");
  return { ok: errors.length === 0, errors };
}
