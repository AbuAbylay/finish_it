// On-page wording for /enter, Home, /lessons and /lesson. Source: COPY.md (Al-Farabi), which wins.
// Lines marked "not in COPY.md" are ours and need Al-Farabi's review.
import { copy } from "@/lib/content";
import type { Mode } from "../types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const enterCopy = {
  headline: "You paid for the course. Let's finish it.",
  subhead:
    "Finish-it coach turns your course into a daily plan sized to your time. It adapts to what you get wrong and gets you to your exam date.",
  primary: "Try it with a sample PMP course",
  creating: "Creating your ID…",
  // COPY.md said "Your progress stays in this browser"; with IDs that is no longer true.
  underButton: "No sign-up. About 2 minutes to your first lesson. Your ID keeps your progress.",
  steps: [
    { lead: "Answer 8 quick questions.", rest: "Your exam date, your time, what gets in the way." },
    { lead: "Take a short check.", rest: "We skip what you already know." },
    {
      lead: "Get today's lesson.",
      rest: "10 to 30 minutes, from your course, with practice questions. Miss one and tomorrow's lesson goes back over it.",
    },
  ],
  // not in COPY.md: the ID step
  yourIdLabel: "Your ID",
  idWarning: "This ID works like a password: anyone who has it can see your progress. Save it to come back on another device.",
  copy: "Copy",
  copied: "Copied",
  copyFailed: "Select the ID and copy it by hand.",
  startSurvey: "Start the 8 questions",
  haveId: "Have an ID?",
  haveIdHelp: "Type it to continue where you left off.",
  idPlaceholder: "e.g. k7m2q-x2pd9-fhwc4-tnr8b",
  continue: "Continue",
  checking: "Checking…",
  welcomeBack: "Welcome back.",
  continueLesson: "Continue today's lesson",
  continueSetup: "Continue where you left off",
  startOver: "Start over",
  // COPY.md: no "Use my own course" button until upload works. It works now (app/upload/page.tsx).
  ownCourse: "Use my own course",
  // not in COPY.md: the own-course path
  ownCourseHelp: "Paste the text of a course you already have.",
  addCourse: "Add your course",
  creditSampleReal: "Sample course: original study notes written for this project; not official PMI material.",
  creditSampleDev: "Sample course: original text written for this demo.",
  creditMethod: "Teaching method adapted from Matt Pocock's teach skill (MIT).",
} as const;

const thousands = (n: number) => n.toLocaleString("en-US");

/** /upload: the learner's own course text. Not in COPY.md; every line needs Al-Farabi's review. */
export const uploadCopy = {
  title: "Your course",
  heading: "Use your own course",
  intro: "Paste the text of your course: your notes, a study guide or a few chapters. We split it into topics and build your plan from it. No text at hand? Type what you are studying, such as “PMP exam”, and we write study notes for it.",
  fieldLabel: "Your course text",
  placeholder: "Paste your course text, or type what you are studying",
  counter: (n: number, max: number) => `${thousands(n)} of ${thousands(max)} characters`,
  chooseFile: "Choose a PDF, .txt or .md file",
  fileHelp: "A PDF needs a text layer and can be up to 10 MB. A scanned PDF has no text to read.",
  fileLoaded: (name: string) => `Loaded ${name}.`,
  fileWrongType: "That file type is not supported. Choose a PDF, .txt or .md file, or paste the text.",
  tryExample: "Try an example text",
  exampleLoaded: "Loaded a one-page example on food safety.",
  exampleFailed: "The example text did not load. Paste your own text instead.",
  readingPdf: "Reading the PDF…",
  // Returned by POST /api/course/pdf.
  pdfNoText: "This PDF has no text layer. It may be a scan. Paste the text instead.",
  pdfTooBig: "That PDF is larger than 10 MB. Paste the part of the course you want to start with.",
  pdfTooLong: "That PDF has more text than we can handle in one go. Paste up to about 10,000 words of it.",
  pdfUnreadable: "We couldn't read that PDF. Paste the text instead.",
  fileTooBig: "That file is too large. Paste the part of the course you want to start with.",
  fileUnreadable: "We couldn't read that file. Paste the text instead.",
  fileEmpty: "That file is empty. Choose another file, or paste the text.",
  caution: "Leave out anything confidential. The text is sent to an AI model, and the parts used in your plan are stored with it.",
  // Also returned by POST /api/course (400 too_short, 413 too_long).
  tooShort: "Type what you are studying, such as “PMP exam”, or paste the text of your course.",
  tooLong: "That is more text than we can handle in one go. Paste up to about 10,000 words.",
  submit: "Build my plan",
  waitingTitle: "Building your plan…",
  waitingLine: "We are reading your course and splitting it into topics. This can take up to a minute. Keep this page open.",
  waitingElapsed: (seconds: number) => `${seconds} ${seconds === 1 ? "second" : "seconds"} so far`,
  slow: "That took longer than we can wait. Try again, or paste a shorter part of your course.",
  signedOut: "Your session has ended. Enter your ID to continue.",
  toEnter: "Go to the ID page",
  doneTitle: (n: number) => `Your plan has ${plural(n, "topic")}.`,
  doneFrom: (title: string) => `Built from “${title}”.`,
  doneNext: "Next: 8 quick questions about your exam date and your time.",
  replace: "Use a different text",
  useSample: "Use the sample PMP course instead",
  loadingSample: "Loading the sample course…",
} as const;

/**
 * The short test's heading with the real number of questions: fewer than five when topics were
 * skipped in the survey. COPY.md has "Quick check: 5 questions"; with five it reads the same.
 */
export const testTitle = (questions: number | null) => (questions === null ? "Quick check" : `Quick check: ${plural(questions, "question")}`);

// Not in COPY.md: an address that leads nowhere.
export const notFoundCopy = {
  tabTitle: "Page not found · Finish-it coach",
  title: "This page doesn't exist.",
  line: "The link may be old or mistyped. Your progress is safe.",
  back: "Go to the start",
} as const;

export const modeLabel: Record<Mode, string> = { new: "New topic", review: "Review", catch_up: "Catch-up" };
export const aboutMinutes = (n: number) => `About ${n} min`;

export const homeCopy = {
  title: "Home",
  today: "Today",
  start: "Start today's lesson",
  another: "Do another lesson",
  doneToday: "Done for today. The next lesson is ready when you are.",
  finished: "You've covered every topic.",
  toFinish: "See your finish line",
  myCourse: "My course",
  topicsDone: (done: number, total: number) => `${done} of ${total} topics done`,
  examOn: (date: string) => `Exam on ${date}`,
  seePlan: "See my plan",
  reviewTitle: "Review coming up",
  dueToday: "Due today",
  backOn: (date: string) => `Back on ${date}`,
  fromUnit: (unit: string) => `From ${unit}`,
  reviewEmptyTitle: "Nothing to review yet.",
  reviewEmptyLine: "Questions you miss come back here, on your next study day.",
} as const;

/** The one name of the button that opens today's lesson, the same on Home and on Plan. */
export function todayButton(plan: { studied_today: boolean; session: { lessons_in_session: number; lessons_done_today: number } }): string {
  const { lessons_in_session: total, lessons_done_today: done } = plan.session;
  if (total > 1 && done > 0 && done < total) return copy.session.startNext(done + 1, total);
  return plan.studied_today ? homeCopy.another : homeCopy.start;
}

/** Pace sentences from COPY.md "Calendar tracker and pace" (single source: copy.pace in lib/content.ts). */
export function paceSentence(p: { lessons_left: number; days_left: number; spare_days: number; on_track: boolean; behind_by: number }): {
  line: string;
  suggestion: string | null;
} {
  if (p.lessons_left === 0) return { line: copy.pace.finished, suggestion: null };
  // spare_days comes from lib/rules.ts pace(): it allows for two lessons a day in sessions of 25 minutes or more.
  if (p.on_track && p.spare_days > 0) return { line: copy.pace.onTrackSpare(p.lessons_left, p.days_left, p.spare_days), suggestion: null };
  if (p.on_track) return { line: copy.pace.onTrackExact, suggestion: null };
  return { line: copy.pace.behind(p.behind_by, p.lessons_left, p.days_left), suggestion: copy.pace.suggestion };
}

export const lessonsCopy = {
  title: "Lessons",
  heading: "Your lessons",
  sub: (course: string) => `${course}, in the order you'll study it.`,
  studied: (date: string) => `Studied ${date}`,
  planned: (date: string) => `Planned ${date}`,
  today: "Today",
  fromCheck: "From your short check",
  minutes: (n: number) => `${n} min`,
  lockedHint: "Unlocks after you pass the lesson before it.",
} as const;

export const lessonCopy = {
  title: "Today's lesson",
  writing: "Writing today's lesson from your course… usually 15–25 seconds.",
  fromCourse: "From your course",
  keyPoints: "Remember this",
  readDone: "I've read it. Check me.",
  quizTitle: (n: number) => `Check yourself: ${plural(n, "question")}`,
  reviewTitle: (n: number) => `From earlier: ${n} quick ${n === 1 ? "question" : "questions"}`,
  reviewSummary: (right: number, total: number) => `From earlier: ${right} of ${total} right`,
  questionOf: (i: number, n: number) => `Question ${i} of ${n}`,
  check: "Check",
  checking: "Checking…",
  right: "Right.",
  notQuite: "Not quite. The answer is",
  next: "Next question",
  toLesson: "Continue to the lesson",
  seeResult: "See my result",
  grading: "Saving your result…",
  reviewFirst: "Answer the questions under “From earlier” first.",
  resultPass: (c: number, t: number) => `Done. ${c} of ${t} right. This topic is finished.`,
  resultFail: (c: number, t: number) => `${c} of ${t} right. We'll go over this again next time, so it sticks.`,
  comingBack: "Coming back to you:",
  backToPlan: "Back to my plan",
  nextLesson: "Next lesson",
  // Not in COPY.md: the result card after the last topic of the course.
  courseFinished: "That was the last topic. You finished the course.",
  toFinish: "See your finish line",
  demoHint: "Demo: move to tomorrow to see how the next lesson changes.",
  demoSkip: "Demo: skip to tomorrow",
  demoSkipping: "Moving to tomorrow…",
  chatInvite: "Something still unclear?",
  chatInviteAction: "Ask about this lesson",
  chatPlaceholder: "Ask anything about today's lesson",
  chatEmpty: "Answers come from today's lesson and your course.",
  chatSend: "Ask",
  chatThinking: "Thinking…",
  rereadBanner: "Re-reading. This doesn't change your progress.",
  rereadExcerpt: "The part of your course this topic covers",
  rereadBack: "Back to lessons",
  lockedTitle: "Locked",
  toOpenLesson: "Go to today's lesson",
  limitTitle: "Daily limit reached",
  stale: "Today's lesson changed. Loading the current one…",
} as const;
