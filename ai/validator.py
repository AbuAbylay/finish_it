"""Checks every model output before the app uses it. No network, no model."""

import re
import unicodedata

_MAP = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"',
                      "–": "-", "—": "-", "−": "-", " ": " "})


def norm(text):
    """Lower-case, collapse whitespace, unify quotes and dashes, for word-for-word comparison."""
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", text).translate(_MAP)).strip().lower()


def words(text):
    return len(text.split())


def find_span(material, quote, start=0):
    """Locate a short quote in the material, tolerant of spacing and punctuation. Returns (start, end) or None."""
    tokens = re.findall(r"\w+", unicodedata.normalize("NFKC", quote))
    if len(tokens) < 3:
        return None
    match = re.compile(r"\W+".join(map(re.escape, tokens)), re.I).search(
        unicodedata.normalize("NFKC", material), start)
    return match.span() if match else None


def fill_excerpts(plan, material):
    """Cut each unit's excerpt out of the material using the model's start and end markers.

    The model only points at the passage; code copies it, so every excerpt is word for word.
    Returns a list of errors.
    """
    errors = []
    for unit in plan["units"]:
        first = find_span(material, unit["start_quote"])
        last = find_span(material, unit["end_quote"], first[0]) if first else None
        if not first or not last:
            unit["excerpt"] = ""
            errors.append(f"{unit['unit_id']}: passage markers not found in the material")
            continue
        unit["excerpt"] = material[first[0]:last[1]].strip()
        count = words(unit["excerpt"])
        if not 80 <= count <= 600:
            errors.append(f"{unit['unit_id']}: passage is {count} words (want 80 to 600)")
    return errors


def _check_question(question, excerpt, errors, warnings):
    tag = question["question_id"]
    options = question["options"]
    if len(options) != 4:
        errors.append(f"{tag}: {len(options)} options (want 4)")
    elif max(len(o) for o in options) >= 20:
        correct = len(options[question["correct_index"]])
        others = [len(o) for i, o in enumerate(options) if i != question["correct_index"]]
        ratio = correct / (sum(others) / 3)
        if ratio > 1.5 or ratio < 0.5:
            errors.append(f"{tag}: correct option stands out by length (ratio {ratio:.2f})")
        elif ratio > 1.25 or ratio < 0.75:
            warnings.append(f"{tag}: correct option length ratio {ratio:.2f}")
    if norm(question["source_quote"]) not in norm(excerpt):
        errors.append(f"{tag}: source_quote is not in the excerpt")


def validate_plan(plan):
    """Run after fill_excerpts. Returns (errors, warnings)."""
    errors, warnings = [], []
    units = {u["unit_id"]: u for u in plan["units"]}
    if not 6 <= len(plan["units"]) <= 10:
        errors.append(f"{len(plan['units'])} units (want 6 to 10)")
    if len(units) != len(plan["units"]):
        errors.append("duplicate unit_id")
    test = plan["placement_test"]
    if len(test) != 5:
        errors.append(f"{len(test)} placement questions (want 5)")
    if len({q["unit_id"] for q in test}) != len(test):
        errors.append("two placement questions test the same unit")
    for question in test:
        if question["unit_id"] not in units:
            errors.append(f"{question['question_id']}: unknown unit {question['unit_id']}")
            continue
        _check_question(question, units[question["unit_id"]]["excerpt"], errors, warnings)
    return errors, warnings


def validate_lesson(lesson, order):
    """Returns (errors, warnings)."""
    errors, warnings = [], []
    excerpt = order["unit"]["excerpt"]
    if lesson["unit_id"] != order["unit"]["unit_id"]:
        errors.append("unit_id does not match the order")
    total = sum(words(s["body_md"]) for s in lesson["sections"])
    cap = (order["minutes"] - 4) * 60
    if total > cap:
        errors.append(f"{total} words (cap {cap})")
    if not 1 <= len(lesson["sections"]) <= 4:
        errors.append(f"{len(lesson['sections'])} sections (want 1 to 4)")
    for number, section in enumerate(lesson["sections"], 1):
        if norm(section["source_quote"]) not in norm(excerpt):
            errors.append(f"section {number}: source_quote is not in the excerpt")
    if len(lesson["key_points"]) > 3:
        errors.append(f"{len(lesson['key_points'])} key points (want at most 3)")
    if len(lesson["quiz"]) != 3:
        errors.append(f"{len(lesson['quiz'])} quiz questions (want 3)")
    for question in lesson["quiz"]:
        _check_question(question, excerpt, errors, warnings)
    concepts = order["review_concepts"]
    if len(lesson["review_quiz"]) != len(concepts):
        errors.append(f"{len(lesson['review_quiz'])} review questions for {len(concepts)} review concepts")
    for question, concept in zip(lesson["review_quiz"], concepts):
        if question["concept"] != concept["concept"]:
            errors.append(f"{question['question_id']}: concept was changed")
        _check_question(question, concept["excerpt"], errors, warnings)
    return errors, warnings
