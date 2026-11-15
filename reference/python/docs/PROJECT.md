# Finish-it coach: project context (Team 7292)

Paste this file into your AI tool first, then your own role file. This file is the single source of truth for the brief, the architecture, the data contracts and the rules. Role files point here instead of repeating it. When something here changes, edit it here and tell the team.

- Working name: **Finish-it coach** (rename freely).
- Architecture: the **optimized** version from the team whiteboard (section "Optimized architecture").
- All times are Asia/Almaty, 15 Nov 2026. **Final submission: 12:00. Internal target: 11:00.**

## 1. The brief (Business Cup 2.0, Nazarbayev University)

**Challenge:** build a web product that closes a fundamental pain for adults in the US, one they will pay for.

| Constraint | Value |
|---|---|
| Audience | US, 25–45. Working adults with jobs, families, bills and goals. |
| Model | B2C. We sell to people, not companies. |
| Platform | Web only. Runs in the browser. |
| Time | 24 hours, idea to working product. |
| Our track | Skills: "Learning and growing. What do people fail to master?" |

**Judging**

| Weight | Criterion | What the jury checks |
|---|---|---|
| 40% | Does it work? (product and engineering) | Works end to end in production. Core value is real, not faked or hardcoded. Quality of UX and code; they read the repo. |
| 20% | What do we sell? (value and retention) | Clear what the user pays for and why they come back tomorrow. |
| 15% | Who do we sell to? (problem and user) | A clear choice of problem and deep understanding of the target user. |
| 15% | Why does it make money? (business potential) | Big or growing niche, $100M ARR long-term, LTV > CAC. |
| 10% | Is it new? (originality) | Not a copy-paste of a business that already exists. |

**Pass/fail:** B2C only. Web only. All three submission items present.

**Submission (one per team, by the captain; resubmitting is allowed, the latest version is reviewed)**

1. **Pitch deck**, PDF, up to 10 slides, covering the criteria.
2. **Production link**: a live web product the jury can open in a browser and use end to end, with **no sign-up or login**.
3. **GitHub repo**: public, no access requests.

**Pitch:** 5 minutes plus 2 minutes of Q&A. The top 10 teams compete for ₸5,000,000.

## 2. The product

**One-liner:** Finish-it coach turns the course you already paid for into a daily plan sized to the time you have, adapts to what you get wrong, and gets you to the finish date.

**Target user (first market):** a working adult, about 28–40, preparing for a professional certification in the evenings, who paid for the prep and has fallen behind. Example certification: PMP (to be confirmed, see §11).

**Pain:** they own a complete course and still quit. The cause is time and pace, not difficulty.

**What they pay for:** a plan to a finish date, daily sessions sized to their time, practice on what they personally missed, and reminders. Price is an open decision (§11).

**Why they come back tomorrow:** today's lesson is ready, the calendar shows whether they are on track for the exam date, and a reminder arrives on planned and missed days.

**What we are not:** a course library, or a quiz generator. Free tools already make quizzes from uploads. We sell finishing.

## 3. Architecture

Principle: **code decides, models write.** Two model calls sit on the critical path: one at setup, one per lesson. Code is the only writer of the learner record.

```
SETUP (once per course)
  Upload (PDF or pasted text) ─┐
  Survey form (8 questions) ───┼─> Haiku: one setup call ──> COURSE PLAN (units + excerpts + short test)
        │ profile                                              │ test questions
        v                                                      v
  LEARNER RECORD <── grader (code) <── answers ── Short test (learner answers)

DAILY LOOP
  LEARNER RECORD ─> code picks next unit ─> ORDER ─> Sonnet: writes one lesson ─> Lesson page (read, then quiz)
        ^                                              ^ unit excerpt from COURSE PLAN      │ answers
        └────────────────────── grader (code) updates record <──────────────────────────────┘
  Lesson page <─> Haiku side chat (on demand, off the critical path)

REMINDERS
  LEARNER RECORD ─> code: calendar + daily check ─> Calendar tracker (on the page)
                                                └─> Email reminder (planned day or missed day, from a template)
```

| Step | Done by | Notes |
|---|---|---|
| Survey | Plain form, no model | Answers saved as the profile (§4.1). |
| Setup call | Haiku (`claude-haiku-5-5`) | Materials + profile in, course plan out (§4.2). |
| Grading | Code | Same grader for the short test and lesson quizzes (§5). |
| Picking the next unit | Code | Builds the order (§4.3) from the record and the plan. |
| Writing a lesson | Sonnet (`claude-sonnet-5-5`) | Order in, lesson out (§4.4). |
| Side chat | Haiku (`claude-haiku-5-5`) | Answers questions about the open lesson. |
| Calendar, reminders | Code | Templates for email. |

All three calls run on the Claude API from one key. They were tested on the sample course at 01:30 (§12).

## 4. Data contracts

Models return JSON matching these shapes. The page renders it; models never return HTML. Field names are fixed: change them here first.

### 4.1 Profile (from the survey form)

```json
{
  "course_title": "PMP exam prep",
  "goal": "Move into a project manager role this spring",
  "success": "Pass the PMP exam on the first attempt",
  "focus": ["risk management", "agile"],
  "skip": ["history of project management"],
  "minutes_per_day": 15,
  "study_days": ["mon", "tue", "wed", "thu", "sat"],
  "deadline": "2027-02-20",
  "prior_knowledge": "Two years coordinating projects, no formal training",
  "blocker": "time",
  "blocker_note": "Evenings disappear after the kids are asleep"
}
```

Survey questions map to fields in order: 1 course title, 2 goal, 3 success, 4 focus and skip, 5 minutes and days, 6 deadline (exam date), 7 prior knowledge, 8 blocker. `blocker` is one of `time`, `motivation`, `difficulty`, `forgetting`, `other`.

### 4.2 Course plan (output of the setup call)

```json
{
  "title": "PMP exam prep",
  "units": [
    {
      "unit_id": "u01",
      "title": "What a project is",
      "objective": "Tell a project apart from ongoing operations",
      "start_quote": "A project is a temporary effort that produces a unique",
      "end_quote": "but she does not yet have a project.",
      "prerequisites": [],
      "excerpt": "Cut from the upload by code, from start_quote to end_quote."
    }
  ],
  "placement_test": [
    {
      "question_id": "p01",
      "unit_id": "u01",
      "concept": "project vs operations",
      "prompt": "Which of these is a project?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 2,
      "explanation": "Why the correct option is correct.",
      "source_quote": "A short verbatim quote from this unit's excerpt."
    }
  ]
}
```

- 6 to 10 units for the MVP, in teaching order.
- The model returns only `start_quote` and `end_quote`, the first and last 8 to 12 words of the passage that teaches the unit. Code finds them in the upload and cuts out `excerpt` (80 to 600 words), so every excerpt is word for word by construction.
- 5 placement questions, each tied to a different unit, spread across the course.

### 4.3 Order (code to Sonnet)

```json
{
  "mode": "new",
  "minutes": 15,
  "target_words": 330,
  "sections": 3,
  "unit": {
    "unit_id": "u04",
    "title": "Identifying risks",
    "objective": "List risks for a small project and rate them",
    "excerpt": "Verbatim source text for this unit."
  },
  "learner": {
    "goal": "Move into a project manager role this spring",
    "focus": ["risk management", "agile"],
    "prior_knowledge": "Two years coordinating projects, no formal training"
  },
  "review_concepts": [
    {
      "concept": "project vs operations",
      "unit_id": "u01",
      "excerpt": "Verbatim source text for the missed concept."
    }
  ],
  "why": "You missed 'project vs operations' yesterday, so today starts with a two-minute review."
}
```

`mode` is `new`, `review` (repeat the same unit) or `catch_up` (short recap after missed days). Code writes `why`; the page shows it above the lesson.

`minutes` is what the learner picks at the start of the session (10, 15, 20 or 30) and defaults to `minutes_per_day` from the profile. Code turns it into `target_words` and `sections`, so a shorter session gets a shorter lesson.

### 4.4 Lesson (output of the lesson call)

```json
{
  "unit_id": "u04",
  "title": "Identifying risks",
  "sections": [
    {
      "heading": "What counts as a risk",
      "body_md": "Short explanation in Markdown.",
      "source_quote": "A short verbatim quote from the excerpt."
    }
  ],
  "key_points": ["One line each, three at most."],
  "quiz": [
    {
      "question_id": "u04-q1",
      "concept": "risk vs issue",
      "prompt": "Which statement describes a risk?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correct_index": 0,
      "explanation": "Why the correct option is correct.",
      "source_quote": "A short verbatim quote from the excerpt."
    }
  ],
  "review_quiz": []
}
```

- `quiz`: 3 questions on the new unit. `review_quiz`: one question per entry in `review_concepts`, same shape.
- Length follows the order's `target_words` and `sections`.

### 4.5 Learner record (written only by code)

```json
{
  "learner_id": "b7c1e0de-0000-4000-8000-000000000000",
  "email": null,
  "profile": {},
  "course_plan_id": "sample-pmp",
  "units": {
    "u01": {"status": "known", "score": 1.0, "last_seen": "2026-11-15"},
    "u02": {"status": "todo", "score": null, "last_seen": null}
  },
  "missed_concepts": [
    {"concept": "project vs operations", "unit_id": "u01", "times_missed": 1, "interval_step": 0, "review_due": "2026-11-16"}
  ],
  "sessions": [
    {"date": "2026-11-15", "unit_id": "u01", "mode": "new", "score": 0.67}
  ],
  "last_active": "2026-11-15",
  "streak": 1,
  "demo_day_offset": 0
}
```

Unit `status` is one of `todo`, `known` (passed in the short test), `done`, `needs_review`. `profile` holds §4.1.

## 5. Rules (plain code, no model)

These rules are implemented in `rules/rules.py` and covered by 28 tests in `tests/test_rules.py`. Reminder texts are in `templates/reminders.json`.

All date logic uses `today = real date + demo_day_offset`.

**Grader (short test and lesson quizzes)**
- `score` = correct answers / total answers, counted over `quiz` only. `review_quiz` answers move review intervals and leave `score` alone.
- Short test: a correct answer sets that unit to `known`. Every other unit starts as `todo`. A wrong answer in the short test changes nothing else: the unit is simply taught.
- Lesson: `score` ≥ 0.6 sets the unit to `done`, otherwise `needs_review`.
- Each wrong answer in a lesson adds or updates a `missed_concepts` entry with `interval_step` 0 and `review_due` = the next study day.
- A correct answer in `review_quiz` moves the entry to the next interval in `[1, 3, 7]` days; after the last interval the entry is removed. A wrong one resets `interval_step` to 0.
- Append a `sessions` entry, set `last_active`, update `streak`.

**Picking the next unit**

With no session yet, start at rule 3.

1. If one or more planned study days were missed since `last_active`: `mode` = `catch_up`, `minutes` = min(session minutes, 10), unit = the last unit seen.
2. Else if the last session's unit is `needs_review`: `mode` = `review`, same unit. After three tries in a row at one unit, move on and return to it once every other unit is covered.
3. Else: `mode` = `new`, unit = the first unit in plan order with status `todo`.
4. Add up to 2 `missed_concepts` with `review_due` ≤ today to `review_concepts`.
5. Write `why` from the branch taken and the review concepts.
6. When no `todo` or `needs_review` unit remains, show the finish screen.

**Session length**
- Session minutes = the learner's choice for today, else `minutes_per_day`, limited to 10 to 30.
- Under 25 minutes, a session is one lesson of at most 20 minutes. From 25 minutes, it is two lessons of half the time each.
- Lesson size: `target_words` = (`minutes` − 4) × 30; `sections` = 2 up to 10 minutes, 3 up to 15, 4 above.

**Pace (calendar tracker)**
- `lessons_left` = units with status `todo` or `needs_review`.
- `days_left` = planned study days from today to `deadline`.
- Show "on track" when `lessons_left` ≤ `days_left` × lessons per session, otherwise "behind by N lessons".

**Reminders**
- Planned-day reminder: on a study day with no session yet.
- Missed-day reminder: the day after a planned study day with no session.
- Text comes from templates with variables (`{course_title}`, `{unit_title}`, `{minutes}`, `{lessons_left}`, `{pace}`, `{goal}`, `{link}`); the `blocker` field selects the tone.

## 6. Lesson and quiz standards

Adapted from Matt Pocock's teach skill (MIT).

- A lesson is short, teaches one unit, and gives the learner one concrete win tied to their goal.
- Every claim comes from the unit `excerpt`. Each section and question carries a `source_quote` found word for word in that excerpt. Code checks this and drops any item that fails.
- Explanation first, kept easy. Then recall practice, kept effortful: questions test use of the idea, not recognition of a sentence.
- All four options have the same length and form. Code shuffles them before display.
- Covering material is not learning it. A unit becomes `done` only on quiz evidence.
- Each lesson ends with an invitation to ask the side chat.

## 7. Scope

| Must work by 07:00 | If time allows | Parked |
|---|---|---|
| Guest start, no login | Real email sending | AI-suggested materials |
| Sample course preloaded with its course plan saved | Haiku side chat | YouTube links, books, papers as input |
| Survey form, short test, initial record | Background generation of the next lesson | Sign-up and accounts |
| Lesson call, lesson page, quiz, grader | Finish screen | Payments |
| Next lesson visibly changes after a miss (`why` line) | Upload of the learner's own PDF or text | |
| Time chooser at the start of a session (10, 15, 20, 30) | | |
| Calendar tracker, skip-to-tomorrow, email preview (by 09:30) | | |

## 8. Team and ownership

| Owner | Layer | File |
|---|---|---|
| Sagyndyk | AI layer: both model calls, prompts, sample course, output checks, templates | `SAGYNDYK-AI.md` |
| Abylay | App layer: repo, database, deployment, pages, rules in §5, demo controls | `ABYLAY-APP.md` |
| Al-Farabi | Case and pitch: user, numbers, positioning, price, deck, script, juror testing, README | `ALFARABI-PITCH.md` |

Interfaces: Sagyndyk delivers three functions that take and return the shapes in §4. Abylay calls them and owns everything around them. Al-Farabi supplies all on-page wording and tests the live link.

## 9. Checkpoints

| Time | What is true |
|---|---|
| 01:00 | Scope and §4 contracts agreed by all three. |
| 02:00 | Empty app is live. Setup call returns a valid course plan for the sample course. User and deck outline fixed. |
| 04:30 | Setup works end to end on the live link. Lesson call returns a valid lesson on its own. |
| 07:00 | Full loop is live: a missed question changes the next lesson. **First submission made.** |
| 09:30 | Calendar, skip-to-tomorrow and email preview done. Feature freeze. |
| 11:00 | Final submission. |

## 10. Conventions

- The API key lives in one server environment variable, `ANTHROPIC_API_KEY`. The repo is public, so the key stays out of every commit and out of browser code.
- Models and effort levels are environment variables too (`SETUP_MODEL`, `LESSON_MODEL`, `CHAT_MODEL`, `SETUP_EFFORT`, `LESSON_EFFORT`), so a swap is a one-line change.
- The README credits Matt Pocock's teach skill (MIT) for the teaching method.
- The demo path is the product: a juror with no account and no files must reach a lesson in under two minutes.

## 11. Open decisions

| Decision | Owner | Due |
|---|---|---|
| First certification named in the pitch (PMP is the working example) | Al-Farabi | 02:00 |
| Price and what the learner pays for after finishing one course | Al-Farabi | 04:30 |
| Stack: framework, database, host (write it into `ABYLAY-APP.md`) | Abylay | 01:00 |
| Who is the captain and submits | Team | 01:00 |
| How an uploaded PDF becomes text (the calls take plain text) | Abylay | 04:30 |
| Whether the Python reference in `ai/` is used as is or ported to the app's language | Abylay, Sagyndyk | 02:00 |
| Any part of the original whiteboard map the team wants back | Team | 01:00 |

## 12. Measured on the sample course (01:30)

Reference code is in `ai/` (Python, standard library only). Prompts are in `prompts/`, schemas in `schemas/`.

| Call | Model and effort | Time | Cost per call | Result |
|---|---|---|---|---|
| Setup | Haiku 5.5 | 30 to 57 s | about $0.005 | 5 of 6 runs passed every check; the sixth failed one option-length check |
| Lesson at 10, 15, 20 minutes | Sonnet 5.5, medium effort | 9 to 11 s | about $0.02 | 173, 311 and 351 words in 2, 3 and 4 sections |
| Lesson | Sonnet 5.5, medium effort | 10 to 11 s | about $0.023 | All three modes passed |
| Lesson | Sonnet 5.5, default effort | 21 to 28 s | $0.033 to $0.047 | Passed; slower with no visible gain |
| Lesson | Haiku 5.5, low effort | about 7 s | about $0.001 | Passed; plainer writing |
| Side chat | Haiku 5.5, low effort | about 2 s | under $0.001 | Answered from the lesson |

- The setup call is slow enough to need a progress screen. The sample course skips it by loading `sample/course-plan.json`.
- Structured output cannot enforce array lengths, so counts (4 options, 3 quiz questions, 5 test questions) are checked by `ai/validator.py`.
- The `effort` setting is passed as `output_config.effort`.
- Adaptation was proved at function level at 01:45: one quiz question was answered wrong, `rules.grade_lesson` recorded the concept, `rules.pick_next` put it into the next order, and the next lesson's review question covered it.
- A formula in the prompt did not change lesson length. An explicit `target_words` and `sections` in the order did.
