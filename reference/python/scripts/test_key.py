"""Checks that the API key works and that structured output works on Haiku.

Run:
    pip install anthropic
    export ANTHROPIC_API_KEY="your-key"
    python scripts/test_key.py
"""

import json

import anthropic

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment

schema = {
    "type": "object",
    "properties": {
        "status": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}},
        "correct_index": {"type": "integer", "enum": [0, 1, 2, 3]},
    },
    "required": ["status", "options", "correct_index"],
    "additionalProperties": False,
}

response = client.messages.create(
    model="claude-haiku-5-5",
    max_tokens=300,
    messages=[
        {
            "role": "user",
            "content": (
                'Set status to "ok". Write one multiple-choice question\'s four answer '
                "options about what a project is, and give the index of the correct one."
            ),
        }
    ],
    output_config={"format": {"type": "json_schema", "schema": schema}},
)

text = next(block.text for block in response.content if block.type == "text")
print(json.dumps(json.loads(text), indent=2))
print("tokens in/out:", response.usage.input_tokens, response.usage.output_tokens)
