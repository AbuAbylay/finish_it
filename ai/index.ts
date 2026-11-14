// The only seam between the app and the AI layer.
// With ANTHROPIC_API_KEY set, the real model calls in ./real answer. Without a key the dev stub
// answers instead (no model): every page then shows the "Dev stub" banner and GET /api/health
// reports "ai": "stub", so a missing key is visible and never passes for the real thing.
import * as real from "./real";
import * as stub from "./stub";

const active = process.env.ANTHROPIC_API_KEY ? real : stub;

export const setupCourse = active.setupCourse;
export const writeLesson = active.writeLesson;
export const sideChat = active.sideChat;
export const validatePlan = active.validatePlan;
export const validateLesson = active.validateLesson;
