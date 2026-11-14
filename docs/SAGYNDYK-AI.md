# AI layer: Sagyndyk

Read `PROJECT.md` first. The data shapes are in its §4, the rules in §5, the lesson standards in §6 and the measured numbers in §12. This file covers only what you own and how you know each piece is done.

**Status at 01:45:** the three calls, the validator, the prompts, the schemas, the sample course, the rules module and the reminder templates exist. The calls passed an end-to-end run against the live API, and the adaptation loop was proved at function level.

## What exists

| File | What it is |
|---|---|
| `ai/claude_calls.py` | `setup_course(material_text, profile)`, `write_lesson(order)`, `side_chat(lesson, excerpt, history, question)`. Python, standard library only. Reads `ANTHROPIC_API_KEY`. |
| `ai/validator.py` | `fill_excerpts`, `validate_plan`, `validate_lesson`. No network. |
| `prompts/setup.md`, `prompts/lesson.md`, `prompts/side-chat.md` | The system prompts, one per call. |
| `schemas/course-plan.schema.json`, `schemas/lesson.schema.json` | Output schemas, written within the limits of Claude's structured output. |
| `sample/course.txt` | Original sample course, nine units, about 2,950 words. |
| `sample/profile.json` | A sample survey result. |
| `sample/course-plan.json` | A validated course plan for the sample course. The app loads this so jurors skip the setup wait. |
| `sample/lesson-example.json` | One real lesson, for building the lesson page. |
| `scripts/test_key.py` | Key check using the official SDK. |
| `rules/rules.py`, `tests/test_rules.py` | Grading, next-lesson picking, pace, calendar and reminder timing, with 28 passing tests. Written to unblock Abylay, who owns it from here. |
| `templates/reminders.json` | Ten reminder texts: two types, five blockers. |

## How the calls work

- **Setup call.** The model splits the material into units and writes the five-question short test. For each unit it returns only the first and last 8 to 12 words of the passage. `fill_excerpts` finds those markers in the material and cuts the excerpt out, so every excerpt is word for word by construction.
- **Lesson call.** Takes one order (PROJECT §4.3), returns one lesson (§4.4).
- **Validation.** Errors trigger one retry with the problems listed back to the model; a second failure raises `ModelCallError`. Warnings are returned and never block.
- **Settings.** Environment variables `SETUP_MODEL`, `LESSON_MODEL`, `CHAT_MODEL`, `SETUP_EFFORT`, `LESSON_EFFORT`. Defaults: Haiku 5.5 at low effort for setup and chat, Sonnet 5.5 at medium effort for lessons.

## Validator rules

| Check | Level |
|---|---|
| Passage markers found in the material; passage is 80 to 600 words | Error |
| 6 to 10 units, unique `unit_id` | Error |
| 5 placement questions on 5 different, existing units | Error |
| Lesson: `unit_id` matches the order; 1 to 4 sections; at most 3 key points; exactly 3 quiz questions; one review question per review concept, concept name unchanged | Error |
| Lesson words ≤ (`minutes` − 4) × 60 | Error |
| Every `source_quote` appears in its excerpt (case, spacing, quote and dash styles ignored) | Error |
| Exactly 4 options | Error |
| Correct option's length is more than 1.5× or less than 0.5× the average of the other three (only when options are 20+ characters) | Error |
| Same ratio beyond 1.25× or 0.75× | Warning |

## Steps left

Each step is done only when its check passes.

1. **Commit the files (now).** Copy `ai/`, `prompts/`, `schemas/`, `sample/` and `scripts/` into the repo.
   Done when, from the repo root with your key set, `python ai/claude_calls.py` prints a unit count and writes `sample/course-plan.candidate.json`.
2. **Hand the key to Abylay (now).** As a server environment variable, through a private channel.
3. **Agree the language (by 02:00).** With Abylay: run the Python as is, or port the two files.
   Done when PROJECT §11 records the choice.
4. **Adaptation proof (by 07:00, with Abylay).** On the live link, answer one lesson question wrong.
   Done when the next lesson's `review_quiz` covers that concept and the `why` line names it.
5. **Reminder templates (written; check by 09:30).** `templates/reminders.json` holds two types, `planned_day` and `missed_day`, with one variant per `blocker` value. Variables: `{course_title}`, `{unit_title}`, `{minutes}`, `{lessons_left}`, `{pace}`, `{goal}`, `{link}`. `rules.render_reminder` fills them.
   Done when you have read all ten in Abylay's email preview and edited any wording you dislike.
6. **Messy input test (by 09:30, only if upload is built).** Run `setup_course` on text extracted from a real PDF.
   Done when it returns a valid plan, or upload is cut from the demo.
7. **Output review (before 11:00).** Read five generated lessons beside their excerpts.
   Done when every fact in all five traces to its excerpt, with any miss fixed in the prompt and re-run.
8. **Warm-up (15 minutes before the demo).** Make one setup call and one lesson call, because the first call with each schema is slower.
9. **Key cleanup.** Delete the testing key once no more testing is needed, and the app's key after the pitch.

## Known limits

- Tested on one clean, well-headed sample course. Text extracted from PDFs, with broken lines and no headings, is untested.
- The setup call takes 30 to 57 seconds; the longer times include a retry.
- One of six setup runs produced a question whose correct option was noticeably longer. The current rule lets mild cases through with a warning.
- The side chat sometimes uses bold Markdown, so render its answer as Markdown.
- Structured output guarantees the shape, not the facts. The `source_quote` check is the only automatic guard on grounding; step 7 is the human one.

## Example reminder template

`missed_day` for `time`:

```
Subject: {minutes} minutes keeps your {course_title} date alive

Yesterday got away from you. Today's session is a short catch-up on {unit_title}:
{minutes} minutes and you are done.

{pace}

{link}
```
