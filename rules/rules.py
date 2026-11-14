"""Deterministic rules: grading, picking the next lesson, pace, calendar and reminders.

Plain code, no model and no I/O. Every function takes the learner record, course plan
and profile as dicts in the shapes of docs/PROJECT.md section 4, and a `today` date.
Functions that change the record change it in place and also return a summary.
"""

from datetime import date, timedelta

INTERVALS = [1, 3, 7]          # days until a missed concept comes back, after each correct review
PASS_SCORE = 0.6               # quiz share needed for a unit to count as done
MIN_MINUTES, MAX_MINUTES = 10, 30
MAX_LESSON_MINUTES = 20        # one lesson is never planned longer than this
TWO_LESSON_MINUTES = 25        # from this session length up, a session holds two lessons
CATCH_UP_MINUTES = 10
MAX_REVIEW_CONCEPTS = 2
MAX_ATTEMPTS_IN_A_ROW = 3      # after this many tries at one unit, move on and return to it later
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


# ---------- dates ----------

def today_for(record, real_today):
    """The learner's current day. The demo control moves it forward with demo_day_offset."""
    return real_today + timedelta(days=record.get("demo_day_offset", 0))


def skip_day(record):
    """Demo control: jump to tomorrow."""
    record["demo_day_offset"] = record.get("demo_day_offset", 0) + 1
    return record


def is_study_day(profile, day):
    return WEEKDAYS[day.weekday()] in profile.get("study_days", [])


def next_study_day(profile, after):
    """First planned study day strictly after `after`. Falls back to the next calendar day."""
    for step in range(1, 8):
        day = after + timedelta(days=step)
        if is_study_day(profile, day):
            return day
    return after + timedelta(days=1)


def study_day_on_or_after(profile, day):
    return day if is_study_day(profile, day) else next_study_day(profile, day)


def study_days_between(profile, start, end):
    """Planned study days strictly between two dates."""
    days = []
    day = start + timedelta(days=1)
    while day < end:
        if is_study_day(profile, day):
            days.append(day)
        day += timedelta(days=1)
    return days


def _date(text):
    return date.fromisoformat(text)


# ---------- record ----------

def new_record(learner_id, profile, plan, course_plan_id):
    return {
        "learner_id": learner_id,
        "email": None,
        "profile": profile,
        "course_plan_id": course_plan_id,
        "units": {u["unit_id"]: {"status": "todo", "score": None, "last_seen": None} for u in plan["units"]},
        "missed_concepts": [],
        "sessions": [],
        "last_active": None,
        "streak": 0,
        "demo_day_offset": 0,
    }


def _find_missed(record, concept, unit_id):
    for entry in record["missed_concepts"]:
        if entry["concept"] == concept and entry["unit_id"] == unit_id:
            return entry
    return None


def _miss(record, concept, unit_id, due):
    entry = _find_missed(record, concept, unit_id)
    if entry:
        entry["times_missed"] += 1
        entry["interval_step"] = 0
        entry["review_due"] = due.isoformat()
    else:
        record["missed_concepts"].append({"concept": concept, "unit_id": unit_id, "times_missed": 1,
                                          "interval_step": 0, "review_due": due.isoformat()})


# ---------- grading ----------

def grade_placement(record, plan, answers, today):
    """Short test. A correct answer marks its unit as known. Wrong answers change nothing:
    the unit stays todo and is taught normally."""
    known = []
    for question in plan["placement_test"]:
        if answers.get(question["question_id"]) == question["correct_index"]:
            record["units"][question["unit_id"]] = {"status": "known", "score": 1.0, "last_seen": today.isoformat()}
            known.append(question["unit_id"])
    record["last_active"] = today.isoformat()
    return {"correct": len(known), "total": len(plan["placement_test"]), "known_units": known}


def grade_lesson(record, order, lesson, answers, today):
    """Lesson quiz. `answers` maps question_id to the chosen option index in the model's original order."""
    profile = record["profile"]
    unit_id = order["unit"]["unit_id"]
    due = next_study_day(profile, today)

    quiz = lesson["quiz"]
    wrong = [q for q in quiz if answers.get(q["question_id"]) != q["correct_index"]]
    score = (len(quiz) - len(wrong)) / len(quiz) if quiz else 0.0
    status = "done" if score >= PASS_SCORE else "needs_review"
    record["units"][unit_id] = {"status": status, "score": round(score, 2), "last_seen": today.isoformat()}
    for question in wrong:
        _miss(record, question["concept"], unit_id, due)

    reviews_passed, reviews_failed = [], []
    for question, concept in zip(lesson.get("review_quiz", []), order.get("review_concepts", [])):
        entry = _find_missed(record, concept["concept"], concept["unit_id"])
        if answers.get(question["question_id"]) == question["correct_index"]:
            reviews_passed.append(concept["concept"])
            if entry:
                step = entry["interval_step"] + 1
                if step >= len(INTERVALS):
                    record["missed_concepts"].remove(entry)
                else:
                    entry["interval_step"] = step
                    entry["review_due"] = study_day_on_or_after(
                        profile, today + timedelta(days=INTERVALS[step])).isoformat()
        else:
            reviews_failed.append(concept["concept"])
            _miss(record, concept["concept"], concept["unit_id"], due)

    sessions = record["sessions"]
    if not any(s["date"] == today.isoformat() for s in sessions):
        unbroken = bool(sessions) and not study_days_between(profile, _date(sessions[-1]["date"]), today)
        record["streak"] = record.get("streak", 0) + 1 if unbroken else 1
    sessions.append({"date": today.isoformat(), "unit_id": unit_id, "mode": order["mode"],
                     "score": round(score, 2), "minutes": order["minutes"]})
    record["last_active"] = today.isoformat()
    return {"score": round(score, 2), "unit_status": status,
            "missed": [q["concept"] for q in wrong],
            "reviews_passed": reviews_passed, "reviews_failed": reviews_failed,
            "finished": lessons_left(record) == 0}


# ---------- picking the next lesson ----------

def clamp_minutes(minutes):
    return max(MIN_MINUTES, min(MAX_MINUTES, int(minutes)))


def lessons_in_session(minutes):
    """A long session holds two lessons instead of one stretched lesson."""
    return 2 if clamp_minutes(minutes) >= TWO_LESSON_MINUTES else 1


def lesson_minutes(minutes):
    """Minutes planned for one lesson within a session of the given length."""
    session = clamp_minutes(minutes)
    return max(MIN_MINUTES, min(MAX_LESSON_MINUTES, session // lessons_in_session(session)))


def lesson_size(minutes):
    """How long a lesson for this many minutes should be: (target words, sections)."""
    return (minutes - 4) * 30, 2 if minutes <= 10 else 3 if minutes <= 15 else 4


def lessons_left(record):
    return sum(1 for u in record["units"].values() if u["status"] in ("todo", "needs_review"))


def missed_study_days(record, today):
    if not record.get("last_active"):
        return 0
    return len(study_days_between(record["profile"], _date(record["last_active"]), today))


def _attempts_in_a_row(record, unit_id):
    count = 0
    for session in reversed(record["sessions"]):
        if session["unit_id"] != unit_id:
            break
        count += 1
    return count


def _join(names):
    names = [f"'{n}'" for n in names]
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " and " + names[-1]


def pick_next(record, plan, today, minutes_today=None):
    """Build the order for the next lesson (docs/PROJECT.md section 4.3), or None when the course is finished.

    `minutes_today` is what the learner chose for this session; it defaults to the survey answer.
    """
    profile = record["profile"]
    units = plan["units"]
    by_id = {u["unit_id"]: u for u in units}
    status = {uid: info["status"] for uid, info in record["units"].items()}
    if lessons_left(record) == 0:
        return None

    session_minutes = clamp_minutes(minutes_today or profile.get("minutes_per_day", 15))
    minutes = lesson_minutes(session_minutes)
    sessions = record["sessions"]
    last = sessions[-1] if sessions else None
    missed = missed_study_days(record, today) if last else 0

    first_todo = next((u for u in units if status[u["unit_id"]] == "todo"), None)
    first_review = next((u for u in units if status[u["unit_id"]] == "needs_review"), None)

    if last and missed >= 1:
        mode, unit = "catch_up", by_id[last["unit_id"]]
        minutes = min(minutes, CATCH_UP_MINUTES)
        days = "a study day" if missed == 1 else f"{missed} study days"
        why = f"You missed {days}, so today is a short {minutes}-minute catch-up on '{unit['title']}'."
    elif (last and status[last["unit_id"]] == "needs_review"
          and _attempts_in_a_row(record, last["unit_id"]) < MAX_ATTEMPTS_IN_A_ROW):
        mode, unit = "review", by_id[last["unit_id"]]
        percent = round(last["score"] * 100)
        why = f"You scored {percent}% on '{unit['title']}', so today teaches it again a different way."
    elif first_todo:
        mode, unit = "new", first_todo
        skipped = [u["title"] for u in units[:units.index(unit)] if status[u["unit_id"]] == "known"]
        if not last and skipped:
            why = f"The short test shows you already know {_join(skipped)}, so you start at '{unit['title']}'."
        elif not last:
            why = f"You start with '{unit['title']}', the first unit in your plan."
        else:
            why = f"You finished '{by_id[last['unit_id']]['title']}', so today moves on to '{unit['title']}'."
    else:
        mode, unit = "review", first_review
        why = f"Every unit is covered. '{unit['title']}' still needs work, so today goes back to it."

    due = [m for m in record["missed_concepts"] if m["review_due"] <= today.isoformat()]
    due.sort(key=lambda m: (m["review_due"], -m["times_missed"]))
    review = [{"concept": m["concept"], "unit_id": m["unit_id"], "excerpt": by_id[m["unit_id"]]["excerpt"]}
              for m in due[:MAX_REVIEW_CONCEPTS]]
    if review:
        why += f" It opens with a quick review of {_join([r['concept'] for r in review])}, which you missed earlier."

    target_words, sections = lesson_size(minutes)
    return {
        "mode": mode,
        "minutes": minutes,
        "target_words": target_words,
        "sections": sections,
        "unit": {key: unit[key] for key in ("unit_id", "title", "objective", "excerpt")},
        "learner": {key: profile.get(key) for key in ("goal", "focus", "prior_knowledge")},
        "review_concepts": review,
        "why": why,
    }


# ---------- pace and calendar ----------

def pace(record, today):
    """Whether the learner will reach the deadline at the planned pace."""
    profile = record["profile"]
    left = lessons_left(record)
    if not profile.get("deadline"):
        return {"lessons_left": left, "days_left": None, "status": "no_deadline", "behind_by": 0,
                "text": f"{left} lessons left."}
    deadline = _date(profile["deadline"])
    done_today = any(s["date"] == today.isoformat() for s in record["sessions"])
    first = today + timedelta(days=1) if done_today else today
    days_left = 0
    day = first
    while day <= deadline:
        days_left += 1 if is_study_day(profile, day) else 0
        day += timedelta(days=1)
    capacity = days_left * lessons_in_session(profile.get("minutes_per_day", 15))
    behind_by = max(0, left - capacity)
    if left == 0:
        status, text = "finished", "Course finished."
    elif behind_by == 0:
        status, text = "on_track", f"On track: {left} lessons left, {days_left} study days to go."
    else:
        noun = "lesson" if behind_by == 1 else "lessons"
        status, text = "behind", f"Behind by {behind_by} {noun}: {left} left, {days_left} study days to go."
    return {"lessons_left": left, "days_left": days_left, "status": status, "behind_by": behind_by, "text": text}


def calendar(record, today, days_back=7, days_ahead=14):
    """One entry per day for the calendar tracker."""
    profile = record["profile"]
    done = {s["date"] for s in record["sessions"]}
    started = _date(record["last_active"]) if record.get("last_active") else today
    if record["sessions"]:
        started = min(started, _date(record["sessions"][0]["date"]))
    days = []
    for offset in range(-days_back, days_ahead + 1):
        day = today + timedelta(days=offset)
        planned = is_study_day(profile, day)
        days.append({"date": day.isoformat(), "planned": planned, "done": day.isoformat() in done,
                     "missed": planned and started < day < today and day.isoformat() not in done,
                     "today": offset == 0})
    return days


# ---------- reminders ----------

def reminder_due(record, today):
    """Which reminder to send today: "missed_day", "planned_day" or None."""
    profile = record["profile"]
    if not record.get("last_active"):
        return None
    yesterday = today - timedelta(days=1)
    if is_study_day(profile, yesterday) and _date(record["last_active"]) < yesterday:
        return "missed_day"
    if is_study_day(profile, today) and not any(s["date"] == today.isoformat() for s in record["sessions"]):
        return "planned_day"
    return None


def render_reminder(templates, kind, record, plan, today, link):
    """Fill a reminder template. Returns {"subject", "body"}, or None when no lesson is left."""
    profile = record["profile"]
    order = pick_next(record, plan, today)
    if order is None:
        return None
    info = pace(record, today)
    blocker = profile.get("blocker") if profile.get("blocker") in templates[kind] else "other"
    values = {
        "course_title": profile.get("course_title", "your course"),
        "unit_title": order["unit"]["title"],
        "minutes": str(order["minutes"]),
        "lessons_left": str(info["lessons_left"]),
        "pace": info["text"],
        "goal": profile.get("goal", "your goal"),
        "link": link,
    }
    out = {}
    for part in ("subject", "body"):
        text = templates[kind][blocker][part]
        for key, value in values.items():
            text = text.replace("{" + key + "}", value)
        out[part] = text
    return out
