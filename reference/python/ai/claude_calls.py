"""The three model calls. Standard library only; reads ANTHROPIC_API_KEY from the environment.

    setup_course(material_text, profile) -> course plan   (PROJECT.md section 4.2)
    write_lesson(order)                  -> lesson        (PROJECT.md section 4.4)
    side_chat(lesson, excerpt, history, question) -> str

Run `python ai/claude_calls.py` from the repo root to check the setup call; it writes sample/course-plan.candidate.json.
"""

import json
import os
import pathlib
import urllib.error
import urllib.request

from validator import fill_excerpts, validate_lesson, validate_plan

ROOT = pathlib.Path(__file__).resolve().parent.parent
SETUP_MODEL = os.environ.get("SETUP_MODEL", "claude-haiku-5-5")
LESSON_MODEL = os.environ.get("LESSON_MODEL", "claude-sonnet-5-5")
CHAT_MODEL = os.environ.get("CHAT_MODEL", "claude-haiku-5-5")
SETUP_EFFORT = os.environ.get("SETUP_EFFORT", "low")
LESSON_EFFORT = os.environ.get("LESSON_EFFORT", "medium")


class ModelCallError(Exception):
    """Raised when a call fails or its output fails validation after one retry."""


def _read(relative):
    return (ROOT / relative).read_text(encoding="utf-8")


def _call(model, system, messages, max_tokens, schema=None, effort=None):
    output_config = {}
    if schema:
        output_config["format"] = {"type": "json_schema", "schema": schema}
    if effort:
        output_config["effort"] = effort
    body = {"model": model, "max_tokens": max_tokens, "system": system, "messages": messages}
    if output_config:
        body["output_config"] = output_config
    request = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=json.dumps(body).encode(),
        headers={
            "x-api-key": os.environ["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=300) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        raise ModelCallError(f"HTTP {error.code}: {error.read().decode()[:300]}") from error
    if payload.get("stop_reason") == "max_tokens":
        raise ModelCallError("output was cut off at max_tokens")
    text = "".join(block.get("text", "") for block in payload["content"] if block["type"] == "text")
    return text, payload["usage"]


def setup_course(material_text, profile):
    """One call: the model splits the material into units and writes the short test. Code cuts the excerpts."""
    system = _read("prompts/setup.md")
    schema = json.loads(_read("schemas/course-plan.schema.json"))
    user = "PROFILE:\n" + json.dumps(profile, indent=2) + "\n\nMATERIAL:\n<<<\n" + material_text + "\n>>>"
    messages = [{"role": "user", "content": user}]
    problems = []
    for _ in range(2):
        text, _usage = _call(SETUP_MODEL, system, messages, 16000, schema, SETUP_EFFORT)
        plan = json.loads(text)
        errors = fill_excerpts(plan, material_text)
        more, _warnings = validate_plan(plan)
        problems = errors + more
        if not problems:
            return plan
        messages = [{"role": "user", "content": user + "\n\nYour previous answer had these problems. Fix them:\n- " + "\n- ".join(problems)}]
    raise ModelCallError("course plan failed validation: " + "; ".join(problems))


def write_lesson(order):
    """One call: the model writes the lesson the order asks for."""
    system = _read("prompts/lesson.md")
    schema = json.loads(_read("schemas/lesson.schema.json"))
    user = "ORDER:\n" + json.dumps(order, indent=2)
    messages = [{"role": "user", "content": user}]
    problems = []
    for _ in range(2):
        text, _usage = _call(LESSON_MODEL, system, messages, 8000, schema, LESSON_EFFORT)
        lesson = json.loads(text)
        problems, _warnings = validate_lesson(lesson, order)
        if not problems:
            return lesson
        messages = [{"role": "user", "content": user + "\n\nYour previous answer had these problems. Fix them:\n- " + "\n- ".join(problems)}]
    raise ModelCallError("lesson failed validation: " + "; ".join(problems))


def side_chat(lesson, excerpt, history, question):
    """Answers a learner's question about the open lesson. `history` is a list of {role, content} turns."""
    system = _read("prompts/side-chat.md") + "\n\nLESSON:\n" + json.dumps(lesson) + "\n\nEXCERPT:\n" + excerpt
    text, _usage = _call(CHAT_MODEL, system, list(history) + [{"role": "user", "content": question}], 600, effort="low")
    return text.strip()


if __name__ == "__main__":
    material = _read("sample/course.txt")
    sample_profile = json.loads(_read("sample/profile.json"))
    course_plan = setup_course(material, sample_profile)
    (ROOT / "sample/course-plan.candidate.json").write_text(json.dumps(course_plan, indent=2) + "\n", encoding="utf-8")
    print("units:", len(course_plan["units"]), "| saved sample/course-plan.candidate.json")
