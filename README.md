# Finish-it coach

Finish-it coach turns a course you already paid for into a daily plan sized to the time you have. It adapts to what you get wrong and gets you to your finish date.

Built in 24 hours at Business Cup 2.0 (Nazarbayev University, November 2026) by team 7292.

## How it works

Two model calls sit on the critical path, and plain code makes every decision.

1. **Setup, once per course.** The learner answers eight questions and provides their course text. One model call splits the material into units and writes a five-question short test. Code cuts each unit's excerpt out of the material word for word.
2. **Daily loop.** Code picks the next unit from the learner's record, a second model call writes one short lesson from that unit's excerpt, and code grades the quiz and updates the record. A missed question comes back in a later lesson.
3. **Reminders.** Code builds the calendar and decides when a planned-day or missed-day reminder is due.

Every lesson section and quiz question carries a quote from the learner's own material, and a validator rejects output whose quotes are not found there.

The full design, data shapes and rules are in [`docs/PROJECT.md`](docs/PROJECT.md).

## Repository layout

| Path | Contents |
|---|---|
| `ai/` | The three model calls and the output validator (Python, standard library only) |
| `rules/` | Grading, next-lesson picking, pace, calendar and reminder timing, as plain code |
| `tests/` | Unit tests for the rules |
| `templates/` | Reminder email templates |
| `prompts/` | System prompts, one per call |
| `schemas/` | JSON schemas for the course plan and the lesson |
| `sample/` | Sample course, sample profile, a validated course plan and one example lesson |
| `scripts/` | API key check |
| `docs/` | Project context and build notes |

## Try the AI layer

```
export ANTHROPIC_API_KEY="your-key"
python ai/claude_calls.py
```

This runs the setup call on `sample/course.txt` and writes `sample/course-plan.candidate.json`.

## Run the tests

```
python -m unittest discover -s tests -v
```

The rules need no API key.

## Status

The AI layer and the rules are tested, including the adaptation loop: a missed question is recorded, scheduled and asked again in a later lesson. The web app is in progress.

## Credits

- The teaching method (mission, learning records, short grounded lessons, recall practice) is adapted from the `teach` skill by Matt Pocock, MIT licensed: https://github.com/mattpocock/skills
- `sample/course.txt` is original study notes written for this project. It is not official PMI material.
