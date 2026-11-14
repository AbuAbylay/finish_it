// The real AI layer without the network: ai/validate.ts is tested directly, and ai/real.ts is driven
// with canned model replies (ai/client.ts, the only file that calls the API, is replaced).
// Real calls are covered by: AI_CONTRACT_LIVE=1 npx vitest run tests/ai-contract.test.ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCoursePlan, parseLesson } from "@/lib/contracts";
import { isAiError, type CoursePlan, type Lesson, type Order, type Question } from "@/lib/types";

const { callModel } = vi.hoisted(() => ({ callModel: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/ai/client", () => ({ callModel, FINAL_FAILURES: ["no_key", "auth", "bad_request", "refusal"] }));

import { setupCourse, sideChat, writeLesson } from "@/ai/real";
import { cutExcerpt, flat, questionErrors, snapQuote, trimToWords, validateLesson, validatePlan, wordBudget } from "@/ai/validate";

const root = path.resolve(__dirname, "..");
const material = readFileSync(path.join(root, "sample/course.txt"), "utf8");
const plan = JSON.parse(readFileSync(path.join(root, "sample/course-plan.json"), "utf8")) as CoursePlan;
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.split(/\s+/).length >= 8);

const unit = plan.units[3];
const other = plan.units[0];
const order: Order = {
  mode: "new",
  minutes: 15,
  unit: { unit_id: unit.unit_id, title: unit.title, objective: unit.objective, excerpt: unit.excerpt },
  learner: { goal: "Move into a project manager role", focus: [], prior_knowledge: "Coordinates small projects" },
  review_concepts: [{ concept: "project vs operations", unit_id: other.unit_id, excerpt: other.excerpt }],
  why: "Next up.",
};

/** What the lesson call returns: no ids and no unit_id, those are set by code. */
function modelQuestion(concept: string, source: string, n: number) {
  return {
    concept,
    prompt: `Which choice fits situation ${n}?`,
    options: ["Answer number one here", "Answer number two here", "Answer number six here", "Answer number ten here"],
    correct_index: n % 4,
    explanation: "Because the course says so.",
    source_quote: sentencesOf(source)[n % 3],
  };
}

function modelLesson() {
  const s = sentencesOf(unit.excerpt);
  return {
    title: unit.title,
    sections: [
      { heading: "The idea", body_md: "A short explanation in plain words.", source_quote: s[0] },
      { heading: "An example", body_md: "One worked example for your goal.", source_quote: s[1] },
    ],
    key_points: ["First point.", "Second point."],
    quiz: [1, 2, 3].map((n) => modelQuestion(`idea ${n}`, unit.excerpt, n)),
    review_quiz: [modelQuestion("project vs operations", other.excerpt, 1)],
  };
}

/** What the setup call returns: each passage is named by its first and last words. */
function modelPlan() {
  const words = (t: string) => t.trim().split(/\s+/);
  return {
    title: "Model title",
    units: plan.units.map((u, i) => ({
      unit_id: `unit-${i + 1}`,
      title: u.title,
      objective: u.objective,
      start_quote: words(u.excerpt).slice(0, 8).join(" "),
      end_quote: words(u.excerpt).slice(-8).join(" "),
      prerequisites: i === 0 ? [] : [`unit-${i}`, "unit-99"],
    })),
    placement_test: plan.placement_test.map((q) => ({
      unit_id: `unit-${plan.units.findIndex((u) => u.unit_id === q.unit_id) + 1}`,
      concept: q.concept,
      prompt: q.prompt,
      options: q.options,
      correct_index: q.correct_index,
      explanation: q.explanation,
      source_quote: q.source_quote,
    })),
  };
}

const reply = (value: unknown) => ({ ok: true, text: JSON.stringify(value) });
const userText = (call: number): string => callModel.mock.calls[call][0].messages.at(-1).content;

beforeEach(() => {
  callModel.mockReset();
  delete process.env.SETUP_MODEL;
  delete process.env.LESSON_MODEL;
  delete process.env.LESSON_EFFORT;
});

describe("validator: course plan", () => {
  it("accepts the sample plan", () => {
    expect(validatePlan(plan, material)).toEqual({ ok: true, errors: [] });
  });

  it("rejects a plan with one altered excerpt", () => {
    const broken = clone(plan);
    broken.units[2].excerpt = broken.units[2].excerpt.replace(/\b(\w+) (\w+)\b/, "$2 $1");
    const result = validatePlan(broken, material);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("u03: excerpt is not a word-for-word span of the material");
  });

  it("rejects a plan with one wrong source_quote", () => {
    const broken = clone(plan);
    broken.placement_test[1].source_quote = "A sentence the course never contained, written by a model.";
    const result = validatePlan(broken, material);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(["p02: source_quote is not word for word in its excerpt"]);
  });

  it("requires 6 to 10 units and 5 questions on 5 different units", () => {
    const few = clone(plan);
    few.units = few.units.slice(0, 5);
    few.placement_test = few.placement_test.filter((q) => few.units.some((u) => u.unit_id === q.unit_id));
    expect(validatePlan(few, material).errors.join("\n")).toMatch(/needs 6 to 10 units, has 5/);
    expect(validatePlan(few, material).errors.join("\n")).toMatch(/needs 5 questions/);

    const same = clone(plan);
    same.placement_test[1].unit_id = same.placement_test[0].unit_id;
    expect(validatePlan(same, material).errors.join("\n")).toContain("each placement question must be on a different unit");
  });
});

describe("validator: questions", () => {
  const good: Question = { question_id: "q", ...modelQuestion("idea", unit.excerpt, 1) };

  it("accepts a well-formed question", () => {
    expect(questionErrors(good, unit.excerpt, "q")).toEqual([]);
  });

  it("needs 4 distinct options and a correct_index of 0 to 3", () => {
    expect(questionErrors({ ...good, options: good.options.slice(0, 3) }, unit.excerpt, "q").join("\n")).toContain("exactly 4 options");
    expect(questionErrors({ ...good, correct_index: 4 }, unit.excerpt, "q").join("\n")).toContain("correct_index must be 0, 1, 2 or 3");
    expect(questionErrors({ ...good, correct_index: 1.5 }, unit.excerpt, "q").join("\n")).toContain("correct_index must be 0, 1, 2 or 3");
    const twice = [good.options[0], good.options[0], good.options[2], good.options[3]];
    expect(questionErrors({ ...good, options: twice }, unit.excerpt, "q").join("\n")).toContain("options must differ");
  });

  it("rejects a correct option that stands out by length, unless all options are short", () => {
    const long = [...good.options];
    long[good.correct_index] = "A much longer and more detailed answer that gives itself away at a glance";
    expect(questionErrors({ ...good, options: long }, unit.excerpt, "q").join("\n")).toContain("stands out by length");
    expect(questionErrors({ ...good, options: ["Avoid", "Mitigate it", "Transfer", "Accept"], correct_index: 1 }, unit.excerpt, "q")).toEqual([]);
  });

  it("compares quotes ignoring case, spacing and quote style", () => {
    const source = "The sponsor said: “do not change the scope” – and the team agreed.";
    expect(questionErrors({ ...good, source_quote: 'the sponsor said:  "DO NOT change the scope" - and' }, source, "q")).toEqual([]);
  });
});

describe("validator: lesson", () => {
  const lesson = (): Lesson => {
    const m = modelLesson();
    return {
      unit_id: unit.unit_id,
      title: m.title,
      sections: m.sections,
      key_points: m.key_points,
      quiz: m.quiz.map((q, i) => ({ question_id: `q${i}`, ...q })),
      review_quiz: m.review_quiz.map((q, i) => ({ question_id: `r${i}`, ...q })),
    };
  };

  it("accepts a correct lesson, and the app's own guard accepts it too", () => {
    expect(validateLesson(lesson(), order)).toEqual({ ok: true, errors: [] });
    expect(parseLesson(lesson()).ok).toBe(true);
  });

  it.each([
    ["another unit's id", (l: Lesson) => void (l.unit_id = "u99"), "unit_id must be"],
    ["two quiz questions", (l: Lesson) => void l.quiz.pop(), "quiz needs exactly 3 questions, has 2"],
    ["no review question", (l: Lesson) => void (l.review_quiz = []), "one question per review concept (1), has 0"],
    ["a renamed review concept", (l: Lesson) => void (l.review_quiz[0].concept = "something else"), 'concept must be "project vs operations"'],
    ["a section quote that is not in the excerpt", (l: Lesson) => void (l.sections[1].source_quote = "Not in the course at all."), "sections[1]: source_quote is not word for word"],
    ["a review quote taken from the wrong excerpt", (l: Lesson) => void (l.review_quiz[0].source_quote = sentencesOf(unit.excerpt)[4]), "review_quiz[0]: source_quote is not word for word"],
    ["five sections", (l: Lesson) => void (l.sections = Array(5).fill(l.sections[0])), "1 to 4 sections"],
    ["four key points", (l: Lesson) => void (l.key_points = ["a", "b", "c", "d"]), "at most 3"],
    ["more words than the session allows", (l: Lesson) => void (l.sections[0].body_md = "word ".repeat(700)), "the limit for 15 minutes is 660"],
  ])("rejects %s", (_name, breakIt, message) => {
    const l = lesson();
    breakIt(l);
    const result = validateLesson(l, order);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain(message);
  });

  it("sizes a lesson from its minutes: (minutes - 4) x 30 words to aim for, x 60 at most", () => {
    expect(wordBudget(10)).toEqual({ target: 180, max: 360, sections: 2 });
    expect(wordBudget(15)).toEqual({ target: 330, max: 660, sections: 3 });
    expect(wordBudget(20)).toEqual({ target: 480, max: 960, sections: 3 });
    expect(wordBudget(30)).toEqual({ target: 780, max: 1560, sections: 4 });
    expect(wordBudget(5).max).toBe(240); // never a budget too small to write a lesson in
  });
});

describe("cutting excerpts and snapping quotes", () => {
  const text = "Intro line.\n\nRisk is an uncertain event.  It may help or hurt the project.\n\nAn issue has already happened – it is “live”.\n\nTail.";

  it("cuts the verbatim span between the first and last words, whatever the spacing or quote style", () => {
    const cut = cutExcerpt(text, "risk is an uncertain event. it may", 'happened - it is "live".');
    expect(cut.ok && cut.excerpt).toBe("Risk is an uncertain event.  It may help or hurt the project.\n\nAn issue has already happened – it is “live”.");
    expect(cut.ok && text.includes(cut.excerpt)).toBe(true);
  });

  it("says which quote is missing", () => {
    expect(cutExcerpt(text, "This is not in the text", "Tail.")).toMatchObject({ ok: false, error: expect.stringContaining("start_quote") });
    expect(cutExcerpt(text, "Risk is an uncertain event.", "not there either")).toMatchObject({ ok: false, error: expect.stringContaining("end_quote") });
  });

  it("looks for a passage after the previous one first", () => {
    const repeated = "Scope means the work. More text here.\n\nScope means the work. This is the second time.";
    const cut = cutExcerpt(repeated, "Scope means the work.", "the second time.", 20);
    expect(cut.ok && cut.excerpt).toBe("Scope means the work. This is the second time.");
  });

  it("cuts a passage that runs long back to 600 words, on a paragraph break", () => {
    const paragraph = (word: string, n: number) => `${`${word} `.repeat(n - 1)}end.`;
    const long = [paragraph("alpha", 250), paragraph("beta", 250), paragraph("gamma", 250)].join("\n\n");
    const trimmed = trimToWords(long, 600);
    expect(trimmed.split(/\s+/)).toHaveLength(500);
    expect(long.startsWith(trimmed)).toBe(true);
    expect(trimToWords("short text", 600)).toBe("short text");
  });

  it("keeps positions right after an emoji or another character outside the basic plane", () => {
    const withEmoji = "\u{1F4D8} Study notes \u{1F600}\n\nRisk is an uncertain event. It may help or hurt.\n\nAn issue has already happened.";
    expect(snapQuote("risk is an uncertain event.", withEmoji)).toBe("Risk is an uncertain event.");
    expect(snapQuote("an issue has already happened.", withEmoji)).toBe("An issue has already happened.");
    const cut = cutExcerpt(withEmoji, "Risk is an uncertain", "has already happened.");
    expect(cut.ok && cut.excerpt).toBe("Risk is an uncertain event. It may help or hurt.\n\nAn issue has already happened.");
  });

  it("replaces a quote with the exact words of the source", () => {
    expect(snapQuote('"risk is an uncertain event."', text)).toBe("Risk is an uncertain event.");
    expect(snapQuote("it is \"live\"...", text)).toBe("it is “live”");
    expect(snapQuote("risk is a certain event", text)).toBeNull();
  });
});

describe("writeLesson", () => {
  it("returns a checked lesson with ids, unit and exact quotes set by code", async () => {
    const m = modelLesson();
    m.sections[0].source_quote = `"${m.sections[0].source_quote.toUpperCase()}"`;
    callModel.mockResolvedValueOnce(reply(m));
    const lesson = await writeLesson(order);
    if (isAiError(lesson)) throw new Error(lesson.detail);

    expect(lesson.unit_id).toBe(unit.unit_id);
    expect(lesson.quiz.map((q) => q.question_id)).toEqual([`${unit.unit_id}-q1`, `${unit.unit_id}-q2`, `${unit.unit_id}-q3`]);
    expect(lesson.review_quiz.map((q) => q.question_id)).toEqual([`${unit.unit_id}-r1`]);
    expect(unit.excerpt).toContain(lesson.sections[0].source_quote);
    expect(validateLesson(lesson, order).ok).toBe(true);
    expect(parseLesson(lesson).ok).toBe(true);

    expect(callModel).toHaveBeenCalledTimes(1);
    const request = callModel.mock.calls[0][0];
    expect(request).toMatchObject({ call: "lesson", model: "claude-sonnet-5-5", effort: "medium" });
    expect(request.timeoutMs).toBeLessThanOrEqual(50_000);
    const sent = JSON.parse(userText(0).replace(/<\/?order>/g, ""));
    expect(sent).toMatchObject({ mode: "new", minutes: 15, target_words: 330, max_words: 660, sections: 3 });
    expect(sent.unit.excerpt).toBe(unit.excerpt);
    expect(sent).not.toHaveProperty("why");
  });

  it("tries once more with the validator's errors when the first reply fails a check", async () => {
    const bad = modelLesson();
    bad.quiz.pop();
    callModel.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(modelLesson()));
    const lesson = await writeLesson(order);
    expect(isAiError(lesson)).toBe(false);
    expect(callModel).toHaveBeenCalledTimes(2);
    expect(userText(0)).not.toContain("rejected");
    expect(userText(1)).toContain("quiz needs exactly 3 questions, has 2");
  });

  it("returns an error object after the second failed try, and never throws", async () => {
    const bad = modelLesson();
    bad.quiz[0].options = ["only", "three", "options"];
    callModel.mockResolvedValue(reply(bad));
    const out = await writeLesson(order);
    expect(out).toMatchObject({ error: "The lesson could not be written. Please try again." });
    expect(isAiError(out) && out.detail).toContain("quiz[0]: needs exactly 4 options");
    expect(callModel).toHaveBeenCalledTimes(2);

    callModel.mockReset();
    callModel.mockRejectedValue(new Error("boom"));
    expect(await writeLesson(order)).toMatchObject({ error: "The lesson could not be written. Please try again.", detail: "boom" });
  });

  it("does not retry what a retry cannot fix", async () => {
    for (const reason of ["no_key", "auth", "bad_request", "refusal"]) {
      callModel.mockReset();
      callModel.mockResolvedValue({ ok: false, reason, detail: `failed: ${reason}` });
      const out = await writeLesson(order);
      expect(isAiError(out) && out.detail).toContain(`failed: ${reason}`);
      expect(callModel).toHaveBeenCalledTimes(1);
    }
  });

  it("retries a timeout with the same request", async () => {
    callModel.mockResolvedValueOnce({ ok: false, reason: "timeout", detail: "the request timed out" }).mockResolvedValueOnce(reply(modelLesson()));
    expect(isAiError(await writeLesson(order))).toBe(false);
    expect(userText(1)).toBe(userText(0));
  });

  it("drops a section whose quote is not in the excerpt and keeps the rest", async () => {
    const m = modelLesson();
    m.sections.push({ heading: "Invented", body_md: "Text with no source.", source_quote: "This sentence is not in the course." });
    callModel.mockResolvedValueOnce(reply(m));
    const lesson = await writeLesson(order);
    expect(!isAiError(lesson) && lesson.sections.map((s) => s.heading)).toEqual(["The idea", "An example"]);
    expect(callModel).toHaveBeenCalledTimes(1);
  });

  it("pairs review questions with their concepts by name and keeps the concept's exact name", async () => {
    const second = plan.units[1];
    const two: Order = { ...order, review_concepts: [...order.review_concepts, { concept: "Triple Constraint", unit_id: second.unit_id, excerpt: second.excerpt }] };
    const m = modelLesson();
    m.review_quiz = [modelQuestion("triple constraint", second.excerpt, 2), modelQuestion("Project vs Operations", other.excerpt, 1)];
    callModel.mockResolvedValueOnce(reply(m));
    const lesson = await writeLesson(two);
    if (isAiError(lesson)) throw new Error(lesson.detail);
    expect(lesson.review_quiz.map((q) => q.concept)).toEqual(["project vs operations", "Triple Constraint"]);
    expect(flat(other.excerpt)).toContain(flat(lesson.review_quiz[0].source_quote));
    expect(flat(second.excerpt)).toContain(flat(lesson.review_quiz[1].source_quote));
  });

  it("pairs by name before position, so one reworded name cannot swap two concepts", async () => {
    const two: Order = { ...order, review_concepts: [...order.review_concepts, { concept: "portfolio", unit_id: other.unit_id, excerpt: other.excerpt }] };
    const m = modelLesson();
    // The model answers in the other order and rewords the first concept's name.
    m.review_quiz = [{ ...modelQuestion("portfolio", other.excerpt, 2), prompt: "About the portfolio?" }, { ...modelQuestion("projects and operations", other.excerpt, 1), prompt: "About operations?" }];
    callModel.mockResolvedValueOnce(reply(m));
    const lesson = await writeLesson(two);
    if (isAiError(lesson)) throw new Error(lesson.detail);
    expect(lesson.review_quiz.map((q) => [q.concept, q.prompt])).toEqual([
      ["project vs operations", "About operations?"],
      ["portfolio", "About the portfolio?"],
    ]);
  });

  it("takes model and effort from the environment, and ignores a model id that is not Claude's", async () => {
    process.env.LESSON_MODEL = "gemini-3.8-flash";
    process.env.LESSON_EFFORT = "high";
    callModel.mockResolvedValueOnce(reply(modelLesson()));
    await writeLesson(order);
    expect(callModel.mock.calls[0][0]).toMatchObject({ model: "claude-sonnet-5-5", effort: "high" });

    process.env.LESSON_MODEL = "claude-opus-5-5";
    process.env.LESSON_EFFORT = "enormous";
    callModel.mockResolvedValueOnce(reply(modelLesson()));
    await writeLesson(order);
    expect(callModel.mock.calls[1][0]).toMatchObject({ model: "claude-opus-5-5", effort: "medium" });
  });
});

describe("setupCourse", () => {
  it("cuts each excerpt out of the material and returns a plan both guards accept", async () => {
    callModel.mockResolvedValueOnce(reply(modelPlan()));
    const out = await setupCourse(material, null);
    if (isAiError(out)) throw new Error(out.detail);

    expect(out.title).toBe("Model title");
    expect(out.units.map((u) => u.unit_id)).toEqual(plan.units.map((u) => u.unit_id));
    out.units.forEach((u, i) => expect(flat(u.excerpt)).toBe(flat(plan.units[i].excerpt)));
    expect(out.units[2].prerequisites).toEqual(["u02"]); // unknown and later ids are dropped
    expect(out.placement_test.map((q) => q.question_id)).toEqual(["p01", "p02", "p03", "p04", "p05"]);
    expect(out.placement_test.map((q) => q.unit_id)).toEqual(plan.placement_test.map((q) => q.unit_id));
    expect(validatePlan(out, material).ok).toBe(true);
    expect(parseCoursePlan(out).ok).toBe(true);

    const request = callModel.mock.calls[0][0];
    expect(request).toMatchObject({ call: "setup", model: "claude-haiku-5-5", effort: "low" });
    expect(userText(0)).toContain("<profile>\nnull\n</profile>");
    expect(userText(0)).toContain("<material>");
  });

  it("uses the learner's course title and sends only the profile fields the plan needs", async () => {
    callModel.mockResolvedValueOnce(reply(modelPlan()));
    const out = await setupCourse(material, {
      course_title: "My PMP prep",
      goal: "Pass in spring",
      success: "",
      focus: ["risk"],
      skip: [],
      minutes_per_day: 15,
      study_days: ["mon"],
      deadline: "2027-02-20",
      prior_knowledge: "Some",
      blocker: "time",
      blocker_note: "private note",
    });
    expect(!isAiError(out) && out.title).toBe("My PMP prep");
    expect(userText(0)).toContain('"focus"');
    expect(userText(0)).not.toContain("private note");
  });

  it("tries again when a passage cannot be found, then gives up with an error object", async () => {
    const bad = modelPlan();
    bad.units[4].start_quote = "Words that are nowhere in this course material";
    callModel.mockResolvedValueOnce(reply(bad)).mockResolvedValueOnce(reply(modelPlan()));
    expect(isAiError(await setupCourse(material, null))).toBe(false);
    expect(userText(1)).toContain("u05");
    expect(userText(1)).toContain("start_quote is not in the material");

    callModel.mockReset();
    callModel.mockResolvedValue(reply(bad));
    expect(await setupCourse(material, null)).toMatchObject({ error: "We could not build a study plan from this material. Please try again." });
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it("builds a plan from material that contains emoji", async () => {
    callModel.mockResolvedValueOnce(reply(modelPlan()));
    const decorated = `\u{1F4D8} ${material.replace("## ", "\u{1F680} ## ")}`;
    const out = await setupCourse(decorated, null);
    if (isAiError(out)) throw new Error(out.detail);
    out.units.forEach((u, i) => expect(flat(u.excerpt)).toBe(flat(plan.units[i].excerpt)));
    expect(validatePlan(out, decorated).ok).toBe(true);
  });

  it("refuses material that is too short without calling the model", async () => {
    const out = await setupCourse("A few words only. ".repeat(20), null);
    expect(out).toMatchObject({ error: expect.stringContaining("too short") });
    expect(callModel).not.toHaveBeenCalled();
  });
});

describe("sideChat", () => {
  const graded: Lesson = {
    unit_id: unit.unit_id,
    title: unit.title,
    sections: modelLesson().sections,
    key_points: ["A point."],
    quiz: modelLesson().quiz.map((q, i) => ({ question_id: `q${i}`, ...q })),
    review_quiz: [],
  };
  const open: Lesson = { ...graded, quiz: [], review_quiz: [] };

  it("answers from the lesson and the excerpt, without the quiz until it is graded", async () => {
    callModel.mockResolvedValue({ ok: true, text: "  An answer.  " });
    expect(await sideChat(open, unit.excerpt, [], "What is a work package?")).toBe("An answer.");
    const before = callModel.mock.calls[0][0];
    expect(before).toMatchObject({ call: "chat", model: "claude-haiku-5-5", effort: "low" });
    expect(before.schema).toBeUndefined();
    expect(before.system).toContain(unit.excerpt);
    expect(before.system).toContain("A short explanation in plain words.");
    expect(before.system).not.toContain("answered_quiz");
    expect(before.system).not.toContain("Answer number");

    await sideChat(graded, unit.excerpt, [], "Why was I wrong?");
    expect(callModel.mock.calls[1][0].system).toContain("answered_quiz");
  });

  it("sends the conversation so far, starting from a learner turn", async () => {
    callModel.mockResolvedValue({ ok: true, text: "ok" });
    await sideChat(open, unit.excerpt, [{ role: "assistant", content: "stray" }, { role: "user", content: "first" }, { role: "assistant", content: "reply" }], "second");
    expect(callModel.mock.calls[0][0].messages).toEqual([
      { role: "user", content: "first" },
      { role: "assistant", content: "reply" },
      { role: "user", content: "second" },
    ]);
  });

  it("returns an error object when the model cannot answer", async () => {
    callModel.mockResolvedValue({ ok: false, reason: "refusal", detail: "declined" });
    expect(await sideChat(open, unit.excerpt, [], "?")).toEqual({ error: "The chat could not answer just now. Please try again.", detail: "try 1: declined" });
    expect(callModel).toHaveBeenCalledTimes(1);
  });
});

describe("the seam (ai/index.ts)", () => {
  it("uses the dev stub without a key and the real layer with one", async () => {
    const before = process.env.ANTHROPIC_API_KEY;
    try {
      delete process.env.ANTHROPIC_API_KEY;
      vi.resetModules();
      expect((await import("@/lib/ai-info")).aiImplementation()).toBe("stub");

      process.env.ANTHROPIC_API_KEY = "test-key-not-real";
      vi.resetModules();
      expect((await import("@/lib/ai-info")).aiImplementation()).toBe("real");
    } finally {
      if (before === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = before;
      vi.resetModules();
    }
  });
});
