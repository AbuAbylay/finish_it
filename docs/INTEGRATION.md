# Integrating the AI layer

The app talks to the AI layer through one file, `ai/index.ts`. Today it re-exports a dev stub that builds fill-in-the-gap lessons without a model. The real layer replaces it with a one-line change.

## The switch

```ts
// ai/index.ts
export * from "./real"; // was: export * from "./stub";
```

Nothing else in the app changes. `GET /api/health` then reports `"ai": "real"`, and the dev banner disappears. The app detects the implementation by comparing functions, so `ai/real.ts` does not need to export any extra flag.

## Files the AI layer adds

| File | What it is | Picked up by |
|---|---|---|
| `ai/real.ts` | The five functions below, server-only | `ai/index.ts` (after the switch) |
| `prompts/*.md` | One prompt per model call, readable by the jury | `ai/real.ts` |
| `sample/course.txt` | The sample course material, with its source and license in the README | contract test, upload path |
| `sample/course-plan.json` | The best validated setup run on the sample | **automatically**: it wins over `sample/dev-course-plan.json` |
| `templates/reminders.json` | Reminder emails | **automatically**: it wins over `templates/dev-reminders.json` |

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

- `AiError` is `{ error: string; detail?: string }`. Return it after the one failed retry. `error` is shown to the learner next to a retry button, so write it for them (for example "The lesson could not be written. Please try again."). Put technical detail in `detail`; it is written to the server log, not shown.
- `ValidationResult` is `{ ok: boolean; errors: string[] }`. Run the validators inside `setupCourse` and `writeLesson`, before the app sees the output (SAGYNDYK-AI.md "Validator").
- Never throw for model or validation failures; return an `AiError`. A thrown error becomes a generic 500.

## What the app does around the calls

- **Orders come from code.** `writeLesson` receives an `Order` built by `pickNext` (PROJECT §5). `why` is already written; do not rewrite it.
- **Second guard.** The app re-checks every output against the §4 shapes (`lib/contracts.ts`): 4 options, `correct_index` 0 to 3, unique question ids, at least one section, at least one quiz question. A mismatch is treated like an `AiError`.
- **Answers stay hidden.** The browser gets questions without `correct_index`, `explanation` or `source_quote`. Each answer is revealed only after that question is answered, through `POST /api/answers/check`.
- **Caching.** One lesson per learner, plan, unit, mode, minutes, review concepts and attempt number. A refresh never calls the model again.
- **Cost caps** over a rolling 24 hours (env, defaults): `LESSON_CAP_PER_LEARNER=25`, `LESSON_CAP_PER_IP=150`, `LESSON_CAP_GLOBAL=1000`. They count lesson, setup and chat calls. A call that returns an `AiError` counts only toward the global cap, so a failing model cannot lock one learner or one network out.
- **Side chat.** Until the lesson is graded, `sideChat` receives the lesson without `quiz` and `review_quiz`, so it cannot reveal answers.
- **Time limits.** `/api/lesson` and `/api/course` allow 60 s, `/api/chat` 30 s (`maxDuration`).

## Environment variables

Server only, never in the browser and never committed (`.env*` is ignored).

| Variable | Use |
|---|---|
| `ANTHROPIC_API_KEY` | All three calls: setup, lesson, side chat |
| `SETUP_MODEL` | Default `claude-haiku-5-5` |
| `LESSON_MODEL` | Default `claude-sonnet-5-5` |
| `CHAT_MODEL` | Default `claude-haiku-5-5` |
| `SETUP_EFFORT`, `LESSON_EFFORT` | Defaults `low` and `medium` |

Set them in Vercel (Project → Settings → Environment Variables) and in `.env.local` for local runs. `.env.example` lists every variable.

## Reminder templates format

```json
{
  "planned_day": { "time": { "subject": "…", "body": "…" }, "motivation": { … }, "difficulty": { … }, "forgetting": { … }, "other": { … } },
  "missed_day":  { "time": { … }, … }
}
```

A variant may also be a single string whose first line is `Subject: …`. Variables: `{course_title}`, `{unit_title}`, `{minutes}`, `{lessons_left}`, `{days_left}`, `{pace}` (the pace sentence), `{goal}`, `{link}`. `tests/reminders.test.ts` renders all ten variants and fails on any placeholder left unfilled. A missing blocker falls back to `other`.

## Checking your output before the switch

```bash
npx vitest run tests/ai-contract.test.ts                      # stub + recorded outputs
AI_CONTRACT_LIVE=1 npx vitest run tests/ai-contract.test.ts   # after the switch: real calls (costs a few cents)
```

The contract test checks a setup run on `sample/course.txt` (or the dev text) and one lesson of each mode. It verifies the §4 shapes, 6 to 10 units with verbatim excerpts, 5 placement questions on 5 units, 3 quiz questions, one review question per review concept, 4 options, `correct_index` 0 to 3, every `source_quote` inside its excerpt, and that the browser view carries no answer key.

To check saved model runs without calling the models, drop JSON files into `tests/fixtures/ai/`:

```json
{ "kind": "lesson", "order": { …Order… }, "lesson": { …Lesson… } }
{ "kind": "plan", "material_file": "sample/course.txt", "plan": { …CoursePlan… } }
```

Then run the full loop: `npm run build && npm start`, then `node scripts/e2e.mjs`.
