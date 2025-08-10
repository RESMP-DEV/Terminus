from typing import Any, Dict

# ---- Planner JSON Schema (strict structured output) ----

PLAN_SCHEMA: Dict[str, Any] = {
    "name": "plan_schema",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["plan"],
        "properties": {
            "plan": {
                "type": "array",
                "minItems": 1,
                "maxItems": 50,
                "items": {"type": "string", "minLength": 1},
            }
        },
    },
    "strict": True,
}


# ---- Executor JSON Schema (non-strict structured output) ----

BASH_SCHEMA: Dict[str, Any] = {
    "name": "bash_schema",
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "required": ["command"],
        "properties": {
            "command": {"type": "string", "minLength": 1},
        },
    },
    "strict": True,
}

__all__ = ["PLAN_SCHEMA", "BASH_SCHEMA"]
