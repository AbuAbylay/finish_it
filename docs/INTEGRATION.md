# The AI layer and how the app uses it

The app talks to the AI layer through one file, `ai/index.ts`. Two implementations sit behind it:

| Implementation | When it answers | What it does |
|---|---|---|
| `ai/real.ts` | `ANTHROPIC_API_KEY` is set | Three calls to the Claude API: course setup, one lesson, side chat |
| `ai/stub.ts` | no key | Builds fill-in-the-gap lessons from the excerpt without a model, for development and tests |

With the stub active, every page shows a "Dev stub" banner and `GET /api/health` reports `"ai": "stub"`. A missing key is therefore visible; it never passes for the real thing. To put another implementation behind the seam, export the same five functions and change `ai/index.ts`; nothing else in the app changes.

## Files

| File | What it is |
|---|---|
| `ai/real.ts` | The three calls, each with its checks and one retry |
| `ai/client.ts` | The only file that calls the Claude API (official `@anthropic-ai/sdk`) |
| `ai/validate.ts` | The validator: plain code, no model |
| `prompts/setup.md`, `prompts/lesson.md`, `prompts/side-chat.md` | One prompt per call, read from disk at run time |
| `sample/course.txt` | The sample course: original study notes written for this repository, not official PMI material |
| `sample/course-plan.json` | The sample's course plan. Built by `node scripts/build-sample-plan.mjs` from `sample/course.txt` and `sample/plan-source.json`; excerpts are cut by code. It wins over `sample/dev-course-plan.json` |
| `templates/reminders.json` | Reminder emails, if present. It wins over `templates/dev-reminders.json` |

A learner keeps the plan version they started on: the plan id is a hash of the file, so replacing `sample/course-plan.json` affects only new IDs.

## Function signatures

Types come from `lib/types.ts` (PROJECT.md §4). Every function runs on the server only.

```ts
import type { AiError, ChatTurn, CoursePlan, Lesson, Order, Profile, ValidationResult } from "@/lib/types";

export async function setupCourse(materialText: string, profile: Profile | null): Promise<CoursePlan | AiError>;
export async function writeLesson(order: Order): Promise<Lesson | AiError>;
export async function sideChat(lesson: Lesson, excerpt: string, history: ChatTurn[], question: string): Promise<string | AiError>;
export function validatePlan(plan: CoursePlan, materialText: string): ValidationResult;
export function validateLesson(lesson: Lesson, order: Order): ValidationResult;
```

- `AiError` is `{ error: string; detail?: string }`. `error` is shown to the learner next to a retry button, so it is written for them. `detail` goes to the server log and is never shown.
- `ValidationResult` is `{ ok: boolean; errors: string[] }`.
- None of the functions throws for a model or validation failure. A thrown error would become a generic 500.

## What `ai/real.ts` does

**Models.** One environment variable per call, so a model swap is a one-line change. Only ids that start with `claude-` are used; anything else falls back to the default.

| Call | Model variable (default) | Effort variable (default) | Time limit |
|---|---|---|---|
| Setup | `SETUP_MODEL` (`claude-haiku-5-5`) | `SETUP_EFFORT` (`low`) | 55 s |
| Lesson | `LESSON_MODEL` (`claude-sonnet-5-5`) | `LESSON_EFFORT` (`medium`) | 50 s, first try at most 32 s |
| Side chat | `CHAT_MODEL` (`claude-haiku-5-5`) | `low` | 25 s |

**Structured outputs.** Setup and lesson replies are JSON constrained to a schema (`output_config.format`). The schema fixes the shape; counts, quotes and lengths are checked by the validator, because its error messages are what a second try is given.

**Code does what code can do exactly.**
- The setup call does not retype excerpts. It names each unit's passage by its first and last words (`start_quote`, `end_quote`) and code cuts the passage out of the material, so every excerpt is a verbatim span by construction. A passage longer than 600 words is cut back on a paragraph or sentence.
- Code sets `unit_id`, all `question_id` values (`u04-q1`, `u04-r1`, `p01`) and each review question's `concept` (the exact name from the order).
- A `source_quote` is replaced by the exact words of the excerpt when they can be found there, whatever the model did to case, spacing or quote marks.
- The lesson length is sent as numbers derived from `order.minutes`: about `(minutes - 4) x 30` words to aim for, `(minutes - 4) x 60` at most, and 2 to 4 sections. `Order` itself carries no extra fields. `order.why` is not sent; code wrote it for the page.

**Validator** (`ai/validate.ts`, run on every reply before the app sees it).

| Check | On failure |
|---|---|
| Plan: 6 to 10 units, unique ids, each excerpt a word-for-word span of the material | Retry once |
| Plan: 5 placement questions on 5 different units | Retry once |
| Lesson: 1 to 4 sections; total words within the limit for `minutes` | Retry once |
| Lesson: a section's `source_quote` is in the unit excerpt | That section is dropped; at least one must remain |
| Lesson: exactly 3 `quiz` questions; one `review_quiz` question per review concept | Retry once |
| Question: 4 distinct options, `correct_index` 0 to 3, `source_quote` in its own excerpt | Retry once |
| Question: the correct option does not stand out by length (0.5 to 1.5 times the mean of the other three; skipped when every option is under 20 characters) | Retry once |

Quotes are compared after NFKC normalisation, in lower case, with one style of quotes and dashes and single spaces. The retry is the same request with the validator's errors appended. After a failed second try the function returns an `AiError`. An invalid key, a rejected request or a refusal is not retried.

**Refusals.** Requests carry `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): if the model declines a request for policy reasons, the API re-runs it on that model's default fallback. A refusal that remains comes back as an `AiError`.

**Side chat.** The model gets the lesson's title, sections and key points plus the unit excerpt. It gets the quiz only after the lesson is graded.

**Usage log.** Each call logs one line with the model, input and output tokens, duration and stop reason (`ai lesson: model=... input_tokens=... output_tokens=... ms=...`). No prompt or reply text is logged.

## What the app does around the calls

- **Orders come from code.** `writeLesson` receives an `Order` built by `pickNext` (`lib/rules.ts`).
- **Session length.** `order.minutes` is the length of one lesson. It comes from today's choice (`POST /api/session { minutes }`, or `GET /api/lesson?minutes=NN`; the first choice of a day stands), else from the survey, kept within 10 to 30. From 25 minutes a session is two lessons of half the time each. A catch-up lesson is 10 minutes.
- **Own course.** `POST /api/course { source: "upload", text }` takes 1,500 to 60,000 characters and calls `setupCourse`. The survey comes after the upload, so the profile is normally `null` at that point.
- **Second guard.** The app re-checks every output against the §4 shapes (`lib/contracts.ts`): 4 options, `correct_index` 0 to 3, unique question ids, at least one section, exactly 3 quiz questions. A mismatch is treated like an `AiError`.
- **Answers stay hidden.** The browser gets questions without `correct_index`, `explanation` or `source_quote`. Each answer is revealed only after that question is answered, through `POST /api/answers/check`.
- **Caching.** One lesson per learner, plan, unit, mode, minutes, review concepts and attempt number. A refresh never calls the model again, and an unfinished lesson is resumed whatever session length is chosen later.
- **Cost caps** over a rolling 24 hours (environment variables, defaults): `LESSON_CAP_PER_LEARNER=25`, `LESSON_CAP_PER_IP=600`, `LESSON_CAP_GLOBAL=1000`. They count lesson, setup and chat calls. A call that returns an `AiError` counts only toward the global cap, so a failing model cannot lock one learner or one network out for the day. Failed calls are instead held to 8 per learner and 60 per network in any ten minutes. The global cap bounds total spend.
- **Side chat.** Until the lesson is graded, `sideChat` receives the lesson without `quiz` and `review_quiz`.
- **Time limits.** `/api/lesson` and `/api/course` allow 60 s, `/api/chat` 30 s (`maxDuration`).

## Environment variables

Server only, never in the browser and never committed (`.env*` is ignored). `.env.example` lists every variable.

| Variable | Use |
|---|---|
| `ANTHROPIC_API_KEY` | Turns the real layer on. All three calls use it |
| `SETUP_MODEL`, `LESSON_MODEL`, `CHAT_MODEL` | Model per call (defaults above) |
| `SETUP_EFFORT`, `LESSON_EFFORT` | `low`, `medium`, `high`, `xhigh` or `max` (defaults above) |

Set them in Vercel (Project → Settings → Environment Variables) and in `.env.local` for local runs.

## Reminder templates format

```json
{
  "planned_day": { "time": { "subject": "…", "body": "…" }, "motivation": { … }, "difficulty": { … }, "forgetting": { … }, "other": { … } },
  "missed_day":  { "time": { … }, … }
}
```

A variant may also be a single string whose first line is `Subject: …`. Variables: `{course_title}`, `{unit_title}`, `{minutes}`, `{lessons_left}`, `{days_left}`, `{pace}` (the pace sentence), `{goal}`, `{link}`. `tests/reminders.test.ts` renders all ten variants and fails on any placeholder left unfilled. A missing blocker falls back to `other`.

## Checking the layer

```bash
npx vitest run tests/real-ai.test.ts       # validator and the three calls, with canned model replies (no network)
npx vitest run tests/ai-contract.test.ts   # the stub and any recorded outputs against the §4 contract
```

With a key in `.env.local`, the same contract test runs against the real calls (a setup run on `sample/course.txt` and one lesson of each mode; it costs a few cents):

```bash
AI_CONTRACT_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/ai-contract.test.ts
```

The contract test checks the §4 shapes, 6 to 10 units with verbatim excerpts, 5 placement questions on 5 units, 3 quiz questions, one review question per review concept, 4 options, `correct_index` 0 to 3, the option length rule, every `source_quote` inside its excerpt, and that the browser view carries no answer key.

To check saved model runs without calling the models, drop JSON files into `tests/fixtures/ai/`:

```json
{ "kind": "lesson", "order": { …Order… }, "lesson": { …Lesson… } }
{ "kind": "plan", "material_file": "sample/course.txt", "plan": { …CoursePlan… } }
```

Then run the full loop: `npm run build && npm start`, then `node scripts/e2e.mjs`.
