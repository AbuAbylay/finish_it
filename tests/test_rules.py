"""Run from the repo root:  python -m unittest discover -s tests -v"""

import json
import pathlib
import sys
import unittest
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "rules"))
import rules as R  # noqa: E402

MON, TUE, WED, THU, FRI, SAT, SUN = (date(2026, 11, d) for d in range(16, 23))
NEXT_MON, NEXT_TUE = date(2026, 11, 23), date(2026, 11, 24)


def make_profile(**changes):
    profile = {"course_title": "PMP exam prep", "goal": "Move into a project manager role",
               "success": "Pass the exam", "focus": ["risk"], "skip": [], "minutes_per_day": 15,
               "study_days": ["mon", "tue", "wed", "thu", "sat"], "deadline": "2026-12-05",
               "prior_knowledge": "Some", "blocker": "time", "blocker_note": ""}
    profile.update(changes)
    return profile


def make_plan(units=4):
    return {
        "title": "Test course",
        "units": [{"unit_id": f"u0{i}", "title": f"Unit {i}", "objective": f"Do thing {i}",
                   "start_quote": "a", "end_quote": "b", "prerequisites": [], "excerpt": f"Text of unit {i}."}
                  for i in range(1, units + 1)],
        "placement_test": [
            {"question_id": "p01", "unit_id": "u01", "concept": "idea 1", "prompt": "?", "options": ["a", "b", "c", "d"],
             "correct_index": 2, "explanation": "", "source_quote": ""},
            {"question_id": "p02", "unit_id": "u03", "concept": "idea 3", "prompt": "?", "options": ["a", "b", "c", "d"],
             "correct_index": 0, "explanation": "", "source_quote": ""},
        ],
    }


def make_lesson(order):
    unit_id = order["unit"]["unit_id"]
    question = lambda qid, concept, right: {"question_id": qid, "concept": concept, "prompt": "?",
                                            "options": ["a", "b", "c", "d"], "correct_index": right,
                                            "explanation": "", "source_quote": ""}
    return {"unit_id": unit_id, "title": order["unit"]["title"], "sections": [], "key_points": [],
            "quiz": [question(f"{unit_id}-q{n}", f"{unit_id} concept {n}", n - 1) for n in (1, 2, 3)],
            "review_quiz": [question(f"{c['unit_id']}-r{n}", c["concept"], 3)
                            for n, c in enumerate(order["review_concepts"], 1)]}


def answer(lesson, wrong=()):
    """All correct, except the question ids listed in `wrong`."""
    chosen = {}
    for q in lesson["quiz"] + lesson["review_quiz"]:
        chosen[q["question_id"]] = (q["correct_index"] + 1) % 4 if q["question_id"] in wrong else q["correct_index"]
    return chosen


class RulesTest(unittest.TestCase):
    def setUp(self):
        self.plan = make_plan()
        self.record = R.new_record("guest-1", make_profile(), self.plan, "test")

    def study(self, day, wrong=(), minutes_today=None):
        order = R.pick_next(self.record, self.plan, day, minutes_today)
        lesson = make_lesson(order)
        result = R.grade_lesson(self.record, order, lesson, answer(lesson, wrong), day)
        return order, lesson, result

    # ----- short test -----

    def test_placement_marks_only_correct_units_known(self):
        result = R.grade_placement(self.record, self.plan, {"p01": 2, "p02": 3}, MON)
        self.assertEqual(result["known_units"], ["u01"])
        self.assertEqual(self.record["units"]["u01"]["status"], "known")
        self.assertEqual(self.record["units"]["u03"]["status"], "todo")
        self.assertEqual(self.record["missed_concepts"], [])
        self.assertEqual(self.record["last_active"], "2026-11-16")

    def test_first_lesson_skips_known_units_and_says_why(self):
        R.grade_placement(self.record, self.plan, {"p01": 2}, MON)
        order = R.pick_next(self.record, self.plan, MON)
        self.assertEqual((order["mode"], order["unit"]["unit_id"]), ("new", "u02"))
        self.assertIn("already know 'Unit 1'", order["why"])
        self.assertEqual(order["learner"]["goal"], "Move into a project manager role")

    def test_first_lesson_without_known_units(self):
        order = R.pick_next(self.record, self.plan, MON)
        self.assertEqual((order["mode"], order["unit"]["unit_id"]), ("new", "u01"))
        self.assertIn("first unit", order["why"])

    # ----- grading and moving on -----

    def test_pass_marks_done_and_moves_on(self):
        _, _, result = self.study(MON)
        self.assertEqual((result["score"], result["unit_status"]), (1.0, "done"))
        order = R.pick_next(self.record, self.plan, TUE)
        self.assertEqual((order["mode"], order["unit"]["unit_id"]), ("new", "u02"))
        self.assertIn("finished 'Unit 1'", order["why"])

    def test_two_of_three_passes(self):
        _, _, result = self.study(MON, wrong=("u01-q1",))
        self.assertEqual((result["score"], result["unit_status"]), (0.67, "done"))

    def test_fail_gives_review_of_same_unit_with_missed_concepts(self):
        _, _, result = self.study(MON, wrong=("u01-q1", "u01-q2"))
        self.assertEqual(result["unit_status"], "needs_review")
        self.assertEqual([m["review_due"] for m in self.record["missed_concepts"]], ["2026-11-17"] * 2)
        order = R.pick_next(self.record, self.plan, TUE)
        self.assertEqual((order["mode"], order["unit"]["unit_id"]), ("review", "u01"))
        self.assertIn("33%", order["why"])
        self.assertEqual([c["concept"] for c in order["review_concepts"]], ["u01 concept 1", "u01 concept 2"])
        self.assertEqual(order["review_concepts"][0]["excerpt"], "Text of unit 1.")
        self.assertIn("quick review", order["why"])

    def test_missed_concept_is_due_on_next_planned_study_day(self):
        self.study(MON); self.study(TUE); self.study(WED)
        self.study(THU, wrong=("u04-q3",))
        self.assertEqual(self.record["missed_concepts"][0]["review_due"], "2026-11-21")  # Friday is not planned

    def test_at_most_two_review_concepts(self):
        self.study(MON, wrong=("u01-q1", "u01-q2", "u01-q3"))
        self.assertEqual(len(R.pick_next(self.record, self.plan, TUE)["review_concepts"]), 2)

    # ----- spaced review -----

    def test_review_intervals_then_removal(self):
        self.study(MON, wrong=("u01-q1",))                       # missed, due Tuesday
        self.study(TUE)                                          # reviewed correctly: next in 3 days
        entry = self.record["missed_concepts"][0]
        self.assertEqual((entry["interval_step"], entry["review_due"]), (1, "2026-11-21"))  # Fri -> Sat
        self.assertEqual(R.pick_next(self.record, self.plan, WED)["review_concepts"], [])
        self.study(WED); self.study(SAT)                         # reviewed correctly on Saturday: next in 7 days
        entry = self.record["missed_concepts"][0]
        self.assertEqual((entry["interval_step"], entry["review_due"]), (2, "2026-11-28"))

    def test_third_correct_review_removes_the_concept(self):
        self.record["missed_concepts"] = [{"concept": "x", "unit_id": "u01", "times_missed": 1,
                                           "interval_step": 2, "review_due": "2026-11-16"}]
        _, _, result = self.study(MON)
        self.assertEqual(result["reviews_passed"], ["x"])
        self.assertEqual(self.record["missed_concepts"], [])

    def test_wrong_review_resets_the_interval(self):
        self.record["missed_concepts"] = [{"concept": "x", "unit_id": "u02", "times_missed": 1,
                                           "interval_step": 2, "review_due": "2026-11-16"}]
        _, _, result = self.study(MON, wrong=("u02-r1",))
        entry = self.record["missed_concepts"][0]
        self.assertEqual(result["reviews_failed"], ["x"])
        self.assertEqual((entry["times_missed"], entry["interval_step"], entry["review_due"]), (2, 0, "2026-11-17"))

    # ----- missed days -----

    def test_catch_up_after_missed_study_days(self):
        self.study(MON)
        order = R.pick_next(self.record, self.plan, THU)          # Tuesday and Wednesday missed
        self.assertEqual((order["mode"], order["unit"]["unit_id"], order["minutes"]), ("catch_up", "u01", 10))
        self.assertIn("2 study days", order["why"])

    def test_no_catch_up_when_the_gap_had_no_planned_days(self):
        self.study(MON); self.study(TUE); self.study(WED)
        self.study(THU, wrong=("u04-q1", "u04-q2"))
        self.assertEqual(R.pick_next(self.record, self.plan, SAT)["mode"], "review")  # Friday is not planned

    def test_catch_up_does_not_repeat_forever(self):
        self.study(MON)
        self.study(THU)                                           # the catch-up session
        self.assertEqual(R.pick_next(self.record, self.plan, SAT)["mode"], "new")

    def test_no_catch_up_before_the_first_lesson(self):
        R.grade_placement(self.record, self.plan, {}, MON)
        self.assertEqual(R.pick_next(self.record, self.plan, THU)["mode"], "new")

    # ----- flexible session length -----

    def test_minutes_follow_todays_choice(self):
        self.assertEqual(R.pick_next(self.record, self.plan, MON)["minutes"], 15)             # survey answer
        self.assertEqual(R.pick_next(self.record, self.plan, MON, minutes_today=10)["minutes"], 10)
        self.assertEqual(R.pick_next(self.record, self.plan, MON, minutes_today=20)["minutes"], 20)
        self.assertEqual(R.pick_next(self.record, self.plan, MON, minutes_today=3)["minutes"], 10)   # clamped up
        self.assertEqual(R.pick_next(self.record, self.plan, MON, minutes_today=90)["minutes"], 15)  # 30 = two lessons

    def test_lesson_size_follows_minutes(self):
        sizes = [(o["target_words"], o["sections"]) for o in
                 (R.pick_next(self.record, self.plan, MON, minutes_today=m) for m in (10, 15, 20))]
        self.assertEqual(sizes, [(180, 2), (330, 3), (480, 4)])

    def test_long_session_is_two_lessons(self):
        self.assertEqual([R.lessons_in_session(m) for m in (10, 15, 20, 30)], [1, 1, 1, 2])
        self.assertEqual([R.lesson_minutes(m) for m in (10, 15, 20, 30)], [10, 15, 20, 15])

    # ----- finishing -----

    def test_finish(self):
        results = [self.study(day)[2] for day in (MON, TUE, WED, THU)]
        self.assertEqual([r["finished"] for r in results], [False, False, False, True])
        self.assertIsNone(R.pick_next(self.record, self.plan, SAT))
        self.assertEqual(R.pace(self.record, SAT)["status"], "finished")

    def test_moves_on_after_three_tries_and_returns_at_the_end(self):
        for day in (MON, TUE, WED):
            self.study(day, wrong=("u01-q1", "u01-q2", "u01-q3"))
        self.assertEqual((R.pick_next(self.record, self.plan, THU)["mode"],
                          R.pick_next(self.record, self.plan, THU)["unit"]["unit_id"]), ("new", "u02"))
        self.study(THU); self.study(SAT); self.study(NEXT_MON)
        order = R.pick_next(self.record, self.plan, NEXT_TUE)
        self.assertEqual((order["mode"], order["unit"]["unit_id"]), ("review", "u01"))
        self.assertIn("still needs work", order["why"])

    # ----- pace, calendar, streak -----

    def test_pace_on_track_and_behind(self):
        info = R.pace(self.record, MON)                           # 4 lessons, deadline 5 Dec
        self.assertEqual((info["status"], info["lessons_left"], info["days_left"]), ("on_track", 4, 15))
        self.record["profile"]["deadline"] = "2026-11-17"         # two study days for four lessons
        info = R.pace(self.record, MON)
        self.assertEqual((info["status"], info["behind_by"]), ("behind", 2))
        self.assertIn("Behind by 2 lessons", info["text"])
        self.record["profile"]["minutes_per_day"] = 30            # two lessons a day closes the gap
        self.assertEqual(R.pace(self.record, MON)["status"], "on_track")

    def test_pace_without_deadline(self):
        self.record["profile"]["deadline"] = None
        self.assertEqual(R.pace(self.record, MON)["status"], "no_deadline")

    def test_streak(self):
        self.study(MON); self.study(TUE)
        self.assertEqual(self.record["streak"], 2)
        self.study(THU)                                           # Wednesday missed
        self.assertEqual(self.record["streak"], 1)
        self.study(SAT)                                           # Friday is not planned, so the streak holds
        self.assertEqual(self.record["streak"], 2)

    def test_calendar_flags(self):
        self.study(MON)
        days = {d["date"]: d for d in R.calendar(self.record, THU)}
        self.assertTrue(days["2026-11-16"]["done"])
        self.assertTrue(days["2026-11-17"]["missed"] and days["2026-11-18"]["missed"])
        self.assertTrue(days["2026-11-19"]["today"] and not days["2026-11-19"]["missed"])
        self.assertFalse(days["2026-11-20"]["planned"])

    # ----- reminders and the demo control -----

    def test_reminder_due(self):
        self.assertIsNone(R.reminder_due(self.record, MON))       # not started
        R.grade_placement(self.record, self.plan, {}, MON)
        self.assertEqual(R.reminder_due(self.record, MON), "planned_day")
        self.study(MON)
        self.assertIsNone(R.reminder_due(self.record, MON))
        self.assertEqual(R.reminder_due(self.record, TUE), "planned_day")
        self.assertEqual(R.reminder_due(self.record, WED), "missed_day")
        self.study(THU)
        self.assertIsNone(R.reminder_due(self.record, FRI))       # Friday is not planned
        self.assertEqual(R.reminder_due(self.record, SUN), "missed_day")  # Saturday was missed

    def test_skip_day_moves_today(self):
        self.assertEqual(R.today_for(self.record, MON), MON)
        R.skip_day(self.record); R.skip_day(self.record)
        self.assertEqual(R.today_for(self.record, MON), WED)

    def test_every_reminder_template_renders(self):
        templates = json.loads((ROOT / "templates/reminders.json").read_text())
        self.study(MON)
        for kind in ("planned_day", "missed_day"):
            self.assertEqual(sorted(templates[kind]), ["difficulty", "forgetting", "motivation", "other", "time"])
            for blocker in templates[kind]:
                self.record["profile"]["blocker"] = blocker
                mail = R.render_reminder(templates, kind, self.record, self.plan, WED, "https://example.test/lesson")
                self.assertNotIn("{", mail["subject"] + mail["body"])
                self.assertIn("https://example.test/lesson", mail["body"])
        self.record["profile"]["blocker"] = "something else"
        self.assertIsNotNone(R.render_reminder(templates, "planned_day", self.record, self.plan, WED, "x"))

    # ----- the real sample data -----

    def test_sample_course_plan_works_with_the_rules(self):
        plan = json.loads((ROOT / "sample/course-plan.json").read_text())
        profile = json.loads((ROOT / "sample/profile.json").read_text())
        record = R.new_record("guest-2", profile, plan, "sample-pmp")
        result = R.grade_placement(record, plan, {q["question_id"]: q["correct_index"] for q in plan["placement_test"]}, MON)
        self.assertEqual(result["correct"], 5)
        order = R.pick_next(record, plan, MON)
        self.assertEqual(order["mode"], "new")
        self.assertEqual(record["units"][order["unit"]["unit_id"]]["status"], "todo")
        self.assertGreaterEqual(len(order["unit"]["excerpt"].split()), 80)
        self.assertEqual(R.lessons_left(record), len(plan["units"]) - 5)


if __name__ == "__main__":
    unittest.main()
