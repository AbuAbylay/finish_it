# App layer: Abylay

Read `PROJECT.md` first. The data shapes are in its §4 and the rules you implement are in §5. This file covers only what you build and how you know each piece is done.

## Stack

Fill this in by 01:00 so every AI tool on the team knows it.

| Item | Choice |
|---|---|
| Framework | |
| Database | |
| Host | |
| Language for Sagyndyk's functions | |
| Email service (only if real sending is built) | |

## What you receive

- From Sagyndyk: a tested Python reference in `ai/` with `setup_course`, `write_lesson`, `side_chat` and the validator, plus `prompts/`, `schemas/`, `sample/course.txt`, `sample/profile.json`, `sample/course-plan.json`, `sample/lesson-example.json` and `templates/reminders.json`. Inputs and outputs are the shapes in PROJECT §4. If your backend is not Python, either port the two files (about 250 lines, standard library only) or run them as a small service.
- `sample/lesson-example.json` is a real lesson you can build the lesson page against before the live call is wired.
- From Al-Farabi: all on-page wording, including the eight survey questions with answer choices.

## Steps

Each step is done only when its check passes.

1. **Skeleton live (by 01:30).** Public repo, database connected, deployment pipeline.
   Done when the production URL shows a page and a pushed commit redeploys it.
2. **Guest identity (by 02:00).** On first visit, create a `learner_id` and keep it in the browser. Every API call sends it.
   Done when a fresh private window reaches the survey with zero prompts for an account.
3. **Storage (by 02:00).** Three collections: learners (the record, PROJECT §4.5), course plans (§4.2), cached lessons.
   Done when a record round-trips through save and load unchanged.
4. **Setup flow (by 04:30).** Landing with "Start with the sample course", survey form, short test.
   Done when a new guest finishes the survey and the short test on the live link, and the record shows `known` and `todo` units that match their answers.
5. **Rules (by 04:30).** Already written and tested in Python: `rules/rules.py` holds `new_record`, `grade_placement`, `grade_lesson`, `pick_next`, `pace`, `calendar`, `reminder_due`, `render_reminder`, `skip_day` and `today_for`. Use it as is or port it, and keep `tests/test_rules.py` passing.
   Done when tests cover every branch: `new`, `review`, `catch_up`, a review item coming due, the `[1, 3, 7]` interval steps, and the finish state.
6. **Lesson loop (by 07:00).** Lesson page that renders a lesson, shuffles options, collects answers and calls the grader.
   Done when, on the live link, a wrong answer leads to a next lesson that opens with the `why` line and includes that concept in its review questions.
7. **First submission (07:00).** Hand the production link and repo link to the captain.
8. **Calendar tracker (by 09:30).** Study days, sessions done, streak, and the pace line from PROJECT §5.
   Done when the pace line flips from "on track" to "behind by N lessons" after enough skipped days.
9. **Skip-to-tomorrow (by 09:30).** A visible demo control that adds 1 to `demo_day_offset`.
   Done when pressing it without studying produces a `catch_up` lesson and a missed-day reminder in the preview.
10. **Email preview (by 09:30).** A panel that renders the reminder the learner would get today, from `templates/reminders.json`.
    Done when both reminder types show with real values.
11. **Freeze (09:30).** From here, fix only what Al-Farabi's juror test reports.

Build these only after step 10: upload of a learner's own PDF or text, real email sending with a daily scheduled job, the side-chat panel, background generation of the next lesson.

## Pages

| Page | Purpose |
|---|---|
| `/` | One-liner, "Start with the sample course", no login |
| `/survey` | Eight questions, mostly tap-to-choose |
| `/test` | Five placement questions |
| `/lesson` | Time chooser (10, 15, 20, 30 minutes), `why` line, sections, key points, quiz, result, "next lesson" |
| `/plan` | Calendar tracker, pace line, units with status, email preview, skip-to-tomorrow |
| `/done` | Finish screen when no unit is left |

## API

| Route | Does |
|---|---|
| `POST /api/profile` | Saves the survey into the record |
| `POST /api/course` | Sample: loads the saved plan. Upload: calls `setupCourse`, validates, stores |
| `POST /api/placement` | Grades the short test, writes the initial unit statuses |
| `GET /api/lesson?minutes=15` | Calls `pick_next` with today's minutes, then returns a cached lesson or calls `write_lesson` |
| `POST /api/answers` | Grades a lesson, updates the record, returns the result |
| `GET /api/plan` | Calendar data and the pace line |
| `POST /api/demo/skip-day` | Adds 1 to `demo_day_offset` |
| `GET /api/reminder-preview` | Renders today's reminder from the templates |
| `POST /api/chat` | Calls `sideChat` (if built) |

## Implementation notes

- **Shuffling:** shuffle options at render time and map the learner's choice back to `correct_index`. Send `correct_index` to the browser only after the answer is submitted.
- **Source quotes:** show each section's `source_quote` as a "from your course" line. It is the visible proof that the lesson is grounded.
- **Dates:** every date computation goes through one `today()` helper that adds `demo_day_offset`.
- **Waiting:** measured times are 30 to 57 seconds for the setup call and 10 to 11 seconds for a lesson (PROJECT §12). Show a progress state during setup and a skeleton during the lesson call. Offer a retry button when a call raises an error.
- **Cost protection:** the link is public and every lesson costs money. Limit lesson generations per `learner_id` and per IP, and cache every lesson.
- **Keys:** `ANTHROPIC_API_KEY` exists only in a server environment variable. `.env` is in `.gitignore` from the first commit.

## Repo quality (the jury reads it)

- Rules in one module with tests, prompts in `prompts/`, sample data in `sample/`.
- Small commits with clear messages across the night.
- README from Al-Farabi: what it is, how to run it, architecture sketch, credit to Matt Pocock's teach skill (MIT).
