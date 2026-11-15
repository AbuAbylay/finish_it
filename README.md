# Finish-it coach

Finish-it coach turns a course you already have into a daily study plan: short lessons written from your own material, a quiz after each one, and a plan that changes with what you get wrong and with the days you miss.

Built in 24 hours for Business Cup 2.0 (Nazarbayev University) by Team 7292.

## What you can do in it

1. **Open it.** There is no sign-up. The app gives you an ID that keeps your progress; typing the same ID on another device continues where you stopped.
2. **Pick a course.** Start with the sample course (PMP exam prep, 9 topics), or paste the text of your own course (up to 60,000 characters, or a PDF with a text layer, a `.txt` or a `.md` file; "Try an example text" loads a one-page example). With no text at hand, a few words naming the subject are enough: the app then writes study notes for it and says that they were written by AI.
3. **Set up.** Eight questions (goal, minutes a day, study days, exam date and so on) and a short check (up to 5 questions) that marks the topics you already know.
4. **Study.** Each study day you say how much time you have (10 to 30 minutes) and get a lesson sized to it, with 3 to 5 sections and as many quiz questions. Every section shows the quote it is built on, drawn with a yellow marker: "From your course" for your own text, "From the AI-written notes" for notes the app wrote.
5. **See it adapt.** A question you miss comes back as a review question on a later day. A failed quiz repeats the topic in a different way. A missed study day gives a shorter catch-up lesson. The line above each lesson says why you got that lesson.
6. **Track the date.** The calendar shows done, missed and planned days and whether you are on track for your exam date, and shows a preview of a reminder (email is not switched on in this demo). A row of squares on Home and Plan shows the run to your exam: one square per day, crossed off as you study.
7. **Demo controls.** In the calendar, "Skip to tomorrow" and "Skip 3 days" move the app's date forward so the adaptation can be seen in a minute. "Reset demo" clears the progress of that ID. While the date is moved, every page shows a "Demo date" banner with the real date.

## How it works

The principle is **code decides, models write**. Two model calls sit on the critical path: one when a course is set up, one per lesson. Code is the only writer of the learner record.

```
SETUP (once per course)
  Course text ──> setup call ──> COURSE PLAN (one unit per 350 words of text, 2 to 10, each with a verbatim excerpt, and a short test)
  Survey form ──> profile ─┐
  Short test answers ──> grader (code) ──> LEARNER RECORD

DAILY LOOP
  LEARNER RECORD ──> code picks the next unit and builds an ORDER ──> lesson call ──> lesson page (read, then quiz)
        ^                                                                                 │ answers
        └──────────────────────────── grader (code) updates the record <──────────────────┘
  Lesson page <──> side chat (on demand)

CALENDAR
  LEARNER RECORD ──> code: pace, calendar, which reminder is due ──> calendar on the page, email preview
```

| Step | Done by | Where |
|---|---|---|
| Course plan | Claude (`claude-haiku-5-5`). The model names each passage; code cuts the excerpt out of the text | `ai/real.ts` `setupCourse` |
| Writing a lesson | Claude (`claude-sonnet-5-5`), from one unit's excerpt only | `ai/real.ts` `writeLesson` |
| Side chat | Claude (`claude-haiku-5-5`), from the open lesson and its excerpt | `ai/real.ts` `sideChat` |
| Checking every model reply | Code: counts, word-for-word quotes, option lengths. One retry, then an error with a retry button | `ai/validate.ts` |
| Grading, next lesson, review schedule, session length, pace, reminders, lesson locks | Code, no model | `lib/rules.ts` |

The prompts are in `prompts/`. `docs/INTEGRATION.md` describes the AI layer and its checks in full.

### The rules, as implemented in `lib/rules.ts`

- **Grading.** The score counts the 3 quiz questions. 60% or more marks the unit done; less marks it for review. Review questions do not change the score.
- **Missed concepts.** A wrong answer schedules its concept for the next study day. Each correct review answer pushes it out by 1, then 3, then 7 days; after one more correct answer it is dropped. A wrong review answer starts it over.
- **Next lesson.** After a missed study day: a 10-minute catch-up on the last unit. Otherwise, if the last unit was failed: the same unit again, taught differently. Otherwise: the first unit not yet learned. Up to two concepts that are due are added as review questions.
- **Session length.** Today's choice, else the minutes from the survey, kept within 10 to 30. From 25 minutes a session is two lessons of half the time each.
- **Pace.** Lessons left against study days left before the exam date (two lessons a day for learners who study 25 minutes or more).
- **Locks.** Only the next lesson can be opened and graded. Finished lessons can be re-read. The server enforces this, not the page.
- **Dates.** "Today" is the date in the learner's time zone plus the demo offset. All date logic goes through `today()` in `lib/dates.ts`.

Each rule has a test in `tests/rules.test.ts`.

### Guards around the model

- The browser never receives `correct_index`, `explanation` or a question's source quote before that question is answered. A first answer is locked in.
- A lesson is cached per learner, unit, mode, length, review concepts and attempt, so a refresh never calls the model again.
- Model calls are capped per learner, per network and in total over a rolling 24 hours (`LESSON_CAP_*`), and calls that fail are held to a few per ten minutes. ID lookups and new IDs are rate-limited.
- API keys are read only on the server.

## What is real and what is not

- **Model calls are real when `ANTHROPIC_API_KEY` is set.** Without a key a development stub answers with fill-in-the-gap lessons, every page shows a "Dev stub" banner and `GET /api/health` reports `"ai": "stub"`.
- **The sample course plan is prepared ahead**, not generated on each visit: `scripts/build-sample-plan.mjs` cuts the excerpts from `sample/course.txt` and adds the questions from `sample/plan-source.json`. A course you paste goes through the live setup call.
- **Reminder emails are a preview.** The app works out which reminder is due and renders it on the page. It does not send email.
- **No accounts and no payments.** The ID is the only credential.

## Run it locally

Node 22 or newer.

```bash
npm install
cp .env.example .env.local   # add ANTHROPIC_API_KEY for real lessons; leave it empty to use the dev stub
npm run dev                  # http://localhost:3000
```

Local data goes to `./local.db` (SQLite). Production uses Turso; see `docs/DEPLOY.md`.

## Check it

```bash
npm test                              # 195 tests: rules, database, identity, locks, session length, upload, PDF, grading, reminders, AI layer
npx tsc --noEmit
npm run build && npm start            # in one terminal
node scripts/e2e.mjs                  # in another: the whole juror path over HTTP
```

With a key in `.env.local`, the contract test also runs against the real model calls (a few cents):

```bash
AI_CONTRACT_LIVE=1 node --env-file=.env.local node_modules/vitest/vitest.mjs run tests/ai-contract.test.ts
```

## Repository map

| Path | What is in it |
|---|---|
| `app/` | Pages and API routes (Next.js App Router) |
| `components/` | The app shell, calendar popover, lesson and quiz components |
| `lib/rules.ts` | Every rule above, as pure functions |
| `lib/types.ts`, `lib/contracts.ts` | The data shapes, and the run-time checks on anything that crosses a trust boundary |
| `lib/db.ts`, `lib/migrations.ts` | Storage (libSQL) and versioned migrations |
| `lib/identity.ts` | The only module that knows how a request maps to a learner |
| `ai/` | The AI layer: `real.ts`, `client.ts`, `validate.ts`, and the development `stub.ts` |
| `prompts/` | One prompt per model call |
| `sample/` | The sample course text, its plan, and the source the plan is built from |
| `templates/` | Reminder email templates |
| `tests/`, `scripts/e2e.mjs` | Unit and API tests, and the end-to-end script |
| `docs/` | `INTEGRATION.md` (AI layer), `DEPLOY.md` (Vercel and Turso), `design.md` (the look: two voices, one marker, and the tokens) |
| `reference/python/` | The first version of the AI layer and of the rules, written in Python, kept with its own README, prompts, schemas, sample course, templates, tests and the team's project documents. The app does not import it. Where the two differ, the TypeScript code above is what runs |

## Credits

- The teaching method (explain first, then effortful recall; a unit counts only on quiz evidence) is adapted from Matt Pocock's teach skill (MIT).
- The sample course is original study notes written for this repository. It is not official PMI material. PMP is a registered mark of the Project Management Institute, Inc.; this project is not affiliated with PMI.
- Built with Next.js, React, Tailwind CSS, libSQL (Turso), Zod, Vitest and the Anthropic TypeScript SDK.
