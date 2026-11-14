// Builds sample/course-plan.json from the sample course text and a small source file.
//
//   node scripts/build-sample-plan.mjs [course.txt] [plan-source.json] [course-plan.json]
//
// Defaults: sample/course.txt, sample/plan-source.json, sample/course-plan.json.
// The source file names each unit by its "## " heading and holds the five short-test questions.
// Every excerpt is cut from the text by code, so it is a word-for-word span of the material.
// Nothing is written unless every check passes; the checks mirror tests/ai-contract.test.ts.
import { readFileSync, writeFileSync } from "node:fs";

const [textPath = "sample/course.txt", sourcePath = "sample/plan-source.json", outPath = "sample/course-plan.json"] =
  process.argv.slice(2);

const MAX_EXCERPT_WORDS = 600;
const MIN_EXCERPT_WORDS = 150;

/** Same normalisation as the contract test: NFKC, lower case, one style of quotes and dashes, single spaces. */
const flat = (t) =>
  t
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);
const filled = (v) => typeof v === "string" && v.trim().length > 0;

const text = readFileSync(textPath, "utf8");
const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const errors = [];
const warnings = [];

// --- sections: "## Heading" up to the next "## " heading ---------------------

const sections = new Map();
const headings = [...text.matchAll(/^## +(.+?) *$/gm)];
headings.forEach((m, i) => {
  const from = m.index + m[0].length;
  const to = i + 1 < headings.length ? headings[i + 1].index : text.length;
  if (sections.has(m[1])) errors.push(`heading "${m[1]}" appears twice in ${textPath}`);
  sections.set(m[1], text.slice(from, to).trim());
});

/** The section body, or its leading paragraphs when it runs over the word limit. Always one continuous span. */
function cutExcerpt(body) {
  if (wordCount(body) <= MAX_EXCERPT_WORDS) return body;
  let end = 0;
  let words = 0;
  for (const p of body.matchAll(/[^\n]*\S[^\n]*(?:\n[^\n]*\S[^\n]*)*/g)) {
    const n = wordCount(p[0]);
    if (end > 0 && words + n > MAX_EXCERPT_WORDS) break;
    words += n;
    end = p.index + p[0].length;
  }
  return body.slice(0, end);
}

// --- units -----------------------------------------------------------------

const units = (source.units ?? []).map((u, i) => {
  const unit_id = `u${String(i + 1).padStart(2, "0")}`;
  const body = sections.get(u.heading);
  if (body === undefined) errors.push(`${unit_id}: no "## ${u.heading}" heading in ${textPath}`);
  const excerpt = body === undefined ? "" : cutExcerpt(body);
  if (!filled(u.title)) errors.push(`${unit_id}: title is empty`);
  if (!filled(u.objective)) errors.push(`${unit_id}: objective is empty`);
  if (body !== undefined && !text.includes(excerpt)) errors.push(`${unit_id}: excerpt is not a verbatim span of the text`);
  if (body !== undefined && !flat(text).includes(flat(excerpt))) errors.push(`${unit_id}: excerpt not found after normalisation`);
  const n = wordCount(excerpt);
  if (body !== undefined && n < MIN_EXCERPT_WORDS) errors.push(`${unit_id}: excerpt has ${n} words, under ${MIN_EXCERPT_WORDS}`);
  if (n > MAX_EXCERPT_WORDS) errors.push(`${unit_id}: excerpt has ${n} words, over ${MAX_EXCERPT_WORDS}`);
  const prerequisites = u.prerequisites ?? [];
  for (const p of prerequisites) {
    const k = Number(String(p).slice(1));
    if (!/^u\d\d$/.test(p) || k < 1 || k > i) errors.push(`${unit_id}: prerequisite "${p}" is not an earlier unit`);
  }
  return { unit_id, title: u.title, objective: u.objective, excerpt, prerequisites };
});

if (units.length < 6 || units.length > 10) errors.push(`the plan has ${units.length} units; it needs 6 to 10`);
const byId = new Map(units.map((u) => [u.unit_id, u]));

// --- short test --------------------------------------------------------------

const questions = source.placement_test ?? [];
if (questions.length !== 5) errors.push(`the short test has ${questions.length} questions; it needs exactly 5`);

const placement_test = questions.map((q, i) => {
  const question_id = `p${String(i + 1).padStart(2, "0")}`;
  const unit = byId.get(q.unit);
  if (!unit) errors.push(`${question_id}: unknown unit "${q.unit}"`);
  for (const field of ["concept", "prompt", "explanation", "source_quote"]) {
    if (!filled(q[field])) errors.push(`${question_id}: ${field} is empty`);
  }
  const options = Array.isArray(q.options) ? q.options : [];
  if (options.length !== 4 || !options.every(filled)) errors.push(`${question_id}: needs 4 non-empty options`);
  if (new Set(options.map(flat)).size !== options.length) errors.push(`${question_id}: two options are the same`);
  const c = q.correct_index;
  if (!Number.isInteger(c) || c < 0 || c > 3) errors.push(`${question_id}: correct_index must be 0 to 3`);
  else if (options.length === 4) {
    // The correct option must not stand out by length: against the mean of the other three it must
    // stay within 0.5 to 1.5 (the contract test's rule). Outside 0.75 to 1.25 is reported as a warning.
    const others = options.filter((_, k) => k !== c);
    const ratio = options[c].length / (others.reduce((n, o) => n + o.length, 0) / others.length);
    if (ratio <= 0.5 || ratio >= 1.5) errors.push(`${question_id}: correct option length ratio ${ratio.toFixed(2)} is outside 0.5 to 1.5`);
    else if (ratio < 0.75 || ratio > 1.25) warnings.push(`${question_id}: correct option length ratio ${ratio.toFixed(2)} is outside 0.75 to 1.25`);
  }
  if (unit && filled(q.source_quote)) {
    if (!flat(unit.excerpt).includes(flat(q.source_quote))) errors.push(`${question_id}: source_quote is not in the excerpt of ${unit.unit_id}`);
    else if (!unit.excerpt.includes(q.source_quote)) warnings.push(`${question_id}: source_quote matches only after normalisation`);
  }
  return {
    question_id,
    unit_id: q.unit,
    concept: q.concept,
    prompt: q.prompt,
    options,
    correct_index: c,
    explanation: q.explanation,
    source_quote: q.source_quote,
  };
});

const testedUnits = placement_test.map((q) => q.unit_id);
if (new Set(testedUnits).size !== testedUnits.length) errors.push("two short-test questions are on the same unit");
if (testedUnits.some((id, i) => i > 0 && id <= testedUnits[i - 1])) errors.push("short-test questions must follow the order of the units");
if (units.length > 0 && placement_test.length > 0) {
  if (testedUnits[0] !== units[0].unit_id) errors.push("the first short-test question must be on the first unit");
  if (testedUnits.at(-1) !== units.at(-1).unit_id) errors.push("the last short-test question must be on the last unit");
}
if (placement_test.length > 1 && new Set(placement_test.map((q) => q.correct_index)).size === 1) {
  errors.push("every short-test question has the same correct_index");
}

// --- result ------------------------------------------------------------------

for (const w of warnings) console.warn(`warning: ${w}`);
if (!filled(source.title)) errors.push("the plan title is empty");
if (errors.length > 0) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"}; ${outPath} was not written.`);
  process.exit(1);
}

const plan = { title: source.title, units, placement_test };
writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(`${textPath}: ${wordCount(text)} words`);
for (const u of units) console.log(`  ${u.unit_id}  ${String(wordCount(u.excerpt)).padStart(3)} words  ${u.title}`);
for (const q of placement_test) console.log(`  ${q.question_id}  ${q.unit_id}  answer ${q.correct_index}  ${q.concept}`);
console.log(`Wrote ${outPath}: ${units.length} units, ${placement_test.length} short-test questions.`);
