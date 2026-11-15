// Size limits for a learner's own course text, shared by the upload page and POST /api/course.

/** The shortest input that can name a subject ("SQL"). */
export const UPLOAD_MIN_CHARS = 3;

/**
 * About 150 words. A text at least this long is taught from as it stands. A shorter one is taken as the
 * name of a subject: the setup call then writes study notes for it and builds the plan from those
 * (ai/real.ts, the plan's `source` is "topic").
 */
export const COURSE_TEXT_MIN_CHARS = 900;

/** About 10,000 words: what the setup call can read and plan inside its time budget. */
export const UPLOAD_MAX_CHARS = 60_000;
