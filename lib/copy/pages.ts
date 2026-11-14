// On-page wording for /enter, Home, /lessons and /lesson. Source: COPY.md (Al-Farabi), which wins.
// Lines marked "not in COPY.md" are ours and need Al-Farabi's review.
import { copy } from "@/lib/content";
import type { Mode } from "../types";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const enterCopy = {
  headline: "You paid for the course. Let's finish it.",
  subhead:
    "Finish-it coach turns your course into a 15-minute daily plan that adapts to what you get wrong and gets you to your exam date.",
  primary: "Try it with a sample PMP course",
  creating: "Creating your ID…",
  // COPY.md said "Your progress stays in this browser"; with IDs that is no longer true.
  underButton: "No sign-up. About 2 minutes to your first lesson. Your ID keeps your progress.",
  steps: [
    { lead: "Answer 8 quick questions.", rest: "Your exam date, your time, what gets in the way." },
    { lead: "Take a 5-question check.", rest: "We skip what you already know." },
    {
      lead: "Get today's lesson.",
      rest: "15 minutes, from your course, with a short quiz. Miss a question and tomorrow's lesson goes back over it.",
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
  creditSampleReal: "Sample course: Project Management, 2nd Edition by Adrienne Watt, BCcampus, CC BY 4.0.",
  creditSampleDev: "Sample course: original text written for this demo.",
  creditMethod: "Teaching method adapted from Matt Pocock's teach skill (MIT).",
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

/** Pace sentences from COPY.md "Calendar tracker and pace" (single source: copy.pace in lib/content.ts). */
export function paceSentence(p: { lessons_left: number; days_left: number; on_track: boolean; behind_by: number }): {
  line: string;
  suggestion: string | null;
} {
  if (p.lessons_left === 0) return { line: copy.pace.finished, suggestion: null };
  const spare = p.days_left - p.lessons_left;
  if (p.on_track && spare > 0) return { line: copy.pace.onTrackSpare(p.lessons_left, p.days_left, spare), suggestion: null };
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
  writing: "Writing today's lesson from your course… usually 10–20 seconds.",
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
  next: "Next",
  seeResult: "See my result",
  grading: "Saving your result…",
  reviewFirst: "Answer the questions under “From earlier” first.",
  resultPass: (c: number, t: number) => `Done. ${c} of ${t} right. This topic is finished.`,
  resultFail: (c: number, t: number) => `${c} of ${t} right. We'll go over this again next time, so it sticks.`,
  comingBack: "Coming back to you:",
  backToPlan: "Back to my plan",
  nextLesson: "Next lesson",
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
