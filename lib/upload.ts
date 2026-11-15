// Size limits for a learner's own course text, shared by the upload page and POST /api/course.

/** About 250 words. Below this there is not enough text to split into six topics. */
export const UPLOAD_MIN_CHARS = 900;

/** About 10,000 words: what the setup call can read and plan inside its time budget. */
export const UPLOAD_MAX_CHARS = 60_000;
