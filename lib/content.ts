// All on-page wording lives here so Al-Farabi's final copy (COPY.md) is a one-file change.
// Survey options are tap-to-choose; the option marked default is preselected.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const copy = {
  appName: "Finish-it coach",
  pageTitle: "Finish-it coach: finish the course you paid for",


  survey: {
    progress: (n: number, total: number) => `Question ${n} of ${total}`,
    fillExample: "Fill in example answers",
    fillingExample: "Filling in…",
    back: "Back",
    next: "Next",
    finish: "Start my short check",
    saving: "Saving your plan…",
    pickOne: "Pick one to continue.",
    q1: {
      question: "What are you studying for?",
      options: [{ label: "PMP exam prep (sample course)", value: "PMP exam prep" }],
      ownNote: "Built from the course text you added.",
    },
    q2: {
      question: "Why does this certification matter to you?",
      options: [
        { label: "Move into a project manager role", value: "Move into a project manager role" },
        { label: "Get promoted or earn more where I am", value: "Get promoted or earn more in my current role" },
        { label: "Switch to a new industry", value: "Switch to a new industry" },
        { label: "Keep my job secure", value: "Keep my job secure" },
        { label: "Prove to myself I can finish", value: "Prove to myself I can finish" },
      ],
    },
    q3: {
      question: "What does finishing look like for you?",
      options: [
        { label: "Pass the exam on the first attempt", value: "Pass the PMP exam on the first attempt" },
        { label: "Finish the course before my exam date", value: "Finish the course before the exam date" },
        { label: "Feel ready enough to book the exam", value: "Feel ready enough to book the exam" },
      ],
    },
    /** Questions 2, 3 and 7 for a learner's own course: the same choices without the PMP wording. */
    own: {
      q2: {
        question: "Why does this course matter to you?",
        options: [
          { label: "Move into a new role", value: "Move into a new role" },
          { label: "Get promoted or earn more where I am", value: "Get promoted or earn more in my current role" },
          { label: "Switch to a new field", value: "Switch to a new field" },
          { label: "Keep my job secure", value: "Keep my job secure" },
          { label: "Prove to myself I can finish", value: "Prove to myself I can finish" },
        ],
      },
      q3: {
        question: "What does finishing look like for you?",
        options: [
          { label: "Pass the exam on the first attempt", value: "Pass the exam on the first attempt" },
          { label: "Finish the course before my exam date", value: "Finish the course before the exam date" },
          { label: "Feel ready enough to book the exam", value: "Feel ready enough to book the exam" },
        ],
      },
      q7: {
        question: "Where are you starting from?",
        options: [
          { label: "I use this at work, but I'm self-taught", value: "Uses this at work, self-taught, no formal training" },
          { label: "I've had some formal training", value: "Some formal training in this subject" },
          { label: "I started a course on this before and stopped", value: "Started a course on this before and stopped" },
          { label: "I took the exam before and didn't pass", value: "Took the exam before and did not pass" },
        ],
      },
    },
    q4: {
      question: "Anything to focus on, or skip?",
      help: "Optional, tap any.",
      focusLabel: "Focus more on",
      skipLabel: "Skip, I already know it",
      skipTag: "Skip",
    },
    q5: {
      question: "How much time can you give it?",
      minutesLabel: "Minutes a day",
      minutes: [10, 15, 20, 30],
      daysLabel: "On these days",
      note: "Short and regular beats long and rare.",
    },
    q6: {
      question: "When is your exam?",
      options: [
        { label: "In 2 weeks", days: 14, note: "" },
        { label: "In 4 weeks", days: 28, note: "" },
        { label: "In 8 weeks", days: 56, note: "" },
        { label: "Not booked yet", days: 28, note: "We plan for 4 weeks." },
      ],
      pickDate: "Pick a date",
      afterToday: "Pick an exam date after today.",
    },
    q7: {
      question: "Where are you starting from?",
      options: [
        { label: "I lead projects, but I'm self-taught", value: "Leads projects, self-taught, no formal training" },
        { label: "I've had some formal PM training", value: "Some formal project management training" },
        { label: "I started a prep course before and stopped", value: "Started a prep course before and stopped" },
        { label: "I took the exam before and didn't pass", value: "Took the exam before and did not pass" },
      ],
    },
    q8: {
      question: "What usually stops you?",
      options: [
        { value: "time", label: "There's never enough time" },
        { value: "motivation", label: "I lose motivation after a week or two" },
        { value: "difficulty", label: "The material gets hard" },
        { value: "forgetting", label: "I forget what I studied" },
        { value: "other", label: "Something else" },
      ],
      noteLabel: "Tell us a little more",
      noteOptional: "(optional)",
      notes: {
        time: ["Evenings disappear", "Work runs late", "Kids and family", "Long commute"],
        motivation: ["No one checks on me", "The exam feels far away", "I don't see progress"],
        difficulty: ["Too much jargon", "Hard to apply to real projects", "Practice questions trip me up"],
        forgetting: ["Long gaps between sessions", "I read but don't practise", "Too much at once"],
        other: [],
      },
    },
    days: { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" },
  },

  test: {
    title: "Quick check: 5 questions",
    sub: "This shows what you already know, so your plan skips it. About 2 minutes. No score to worry about.",
    progress: (n: number, total: number) => `${n} of ${total}`,
    hint: "Not sure? Pick your best guess. It only moves the topic into your plan.",
    back: "Back",
    next: "Next",
    submit: "See my plan",
    submitting: "Building your plan…",
    planTitle: (deadline: string) => `Your plan to ${deadline}`,
    known: (known: number, total: number) => ({ before: "You already know ", strong: `${known} of ${total}`, after: " topics. We'll skip those." }),
    knownNone: "We'll start from the first topic.",
    /** `days` is the list of chosen weekdays, or null when all seven are chosen. */
    lessons: (n: number, minutes: number, days: string | null) => ({
      strong: plural(n, "lesson", "lessons"),
      after: `, ${minutes} minutes each, ${days === null ? "every day" : `on ${days}`}.`,
    }),
    topics: "Your topics",
    knownPill: "Known",
    todoPill: "To do",
    start: "Start today's lesson",
    allKnown: "You already know every topic, so there is nothing left to study before your exam.",
    finishLine: "See your finish line",
  },

  // Not in COPY.md: the time chooser at the start of a session and the two-lesson session labels. For Al-Farabi's review.
  session: {
    title: "How much time do you have today?",
    sub: "Today's lesson is sized to fit.",
    groupLabel: "Minutes today",
    oneLesson: (minutes: number) => `One lesson, about ${minutes} minutes.`,
    twoLessons: (each: number) => `Two short lessons, about ${each} minutes each.`,
    start: "Start the lesson",
    saving: "Saving…",
    lessonOf: (n: number, total: number) => `Lesson ${n} of ${total} today`,
    oneMore: (done: number, total: number) => `Lesson ${done} of ${total} done today. One more short lesson to go.`,
    startNext: (n: number, total: number) => `Start lesson ${n} of ${total}`,
  },

  pace: {
    heading: "Your plan",
    finished: "Course finished. Every topic is covered.",
    onTrackSpare: (lessons: number, days: number, spare: number) =>
      `On track. ${plural(lessons, "lesson", "lessons")} left, ${plural(days, "study day", "study days")} to your exam (${spare} spare).`,
    onTrackExact: "On track, with no spare days. Don't miss the next one.",
    behind: (n: number, lessons: number, days: number) =>
      `Behind by ${plural(n, "lesson", "lessons")}. ${plural(lessons, "lesson", "lessons")} left, ${plural(days, "study day", "study days")} to your exam.`,
    suggestion: "Add a study day, or do two lessons on your next day.",
  },

  calendar: {
    open: "Open calendar",
    close: "Close calendar",
    demoActive: "Demo date active",
    prev: "Previous month",
    next: "Next month",
    weekdays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    legend: { done: "Done", missed: "Missed", planned: "Planned", today: "Today", exam: "Exam" },
    cell: { done: "studied", missed: "missed", planned: "planned", rest: "rest day", today: "today", exam: "exam day" },
    loading: "Loading your calendar…",
  },

  demo: {
    label: "Demo controls",
    line: "Move time forward to see how the plan reacts.",
    today: (date: string) => `Today in the demo: ${date}`,
    dateLabel: "Demo date",
    dateLine: (demo: string, real: string) => `the app is showing ${demo}. The real date is ${real}.`,
    skip1: "Skip to tomorrow",
    skip3: "Skip 3 days",
    reset: "Reset demo",
    resetConfirm: "This clears your progress for this ID.",
    resetYes: "Reset",
    resetCancel: "Cancel",
    working: "Moving the clock…",
  },

  plan: {
    title: "Your plan",
    examOn: (date: string) => `Exam on ${date}`,
    lessonsLeft: (n: number) => (n === 1 ? "lesson left" : "lessons left"),
    daysLeft: (n: number) => (n === 1 ? "study day left" : "study days left"),
    streak: "day streak",
    sessions: (n: number) => (n === 1 ? "session done" : "sessions done"),
    calendar: "Calendar",
    start: "Start today's lesson",
    allLessons: "See all lessons",
    reminders: "Reminders",
    remindersPreview: "Preview of a reminder. Email is not switched on in this demo.",
    remindersTabs: "Which reminder to preview",
    emailTypes: { planned_day: "Study day", missed_day: "Missed day" },
    emailToday: "The one for today",
    to: "To: you",
    subject: "Subject",
    skipping: "Moving to tomorrow…",
  },

  done: {
    title: "You finished the course.",
    // Every topic was skipped in the survey or answered right in the short check: nothing was studied.
    nothingTitle: "Every topic is marked as known.",
    nothingLine: "You marked every topic as known, so there is nothing to study. Choose topics again to get a plan.",
    chooseAgain: "Choose topics again",
    choosing: "Opening the questions…",
    line: (units: number, sessions: number, daysBefore: number) => {
      const head = `${plural(units, "topic", "topics")}, ${plural(sessions, "session", "sessions")}`;
      if (daysBefore > 0) return `${head}, ${plural(daysBefore, "day", "days")} before your exam. Now go book it.`;
      if (daysBefore === 0) return `${head}, and your exam is today. Good luck.`;
      return `${head}. Your exam date has passed, so set a new one when you book it.`;
    },
    toPlan: "See my plan",
  },

  shell: {
    nav: { home: "Home", lessons: "Lessons", plan: "Plan" },
    yourId: "Your ID",
    showId: "Show ID",
    hideId: "Hide ID",
    copyId: "Copy ID",
    copied: "Copied",
    signOut: "Sign out",
    collapse: "Collapse sidebar",
    expand: "Expand sidebar",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menu: "Menu",
    search: "Search topics",
    searchNone: "No topics match.",
    searchLoading: "Loading topics…",
    devBanner: "Dev stub: lessons are generated without a model.",
  },

  // Lesson page wording (owned by the lesson page; kept until the merge).
  errors: {
    generic: "Something went wrong.",
    network: "We couldn't reach the server. Check your connection and try again.",
    retry: "Try again",
    home: "Back to start",
  },
} as const;
