import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple

from dotenv import load_dotenv
from openai import APIError, OpenAI

from agent_core.schemas import PLAN_SCHEMA

load_dotenv()

# Environment/config
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    # Defer failure to first call, but keep message explicit for operators.
    pass

# Fake mode allows exercising the end-to-end loop without hitting OpenAI.
# Enable with TERMINUS_FAKE=true, or implicitly if no OPENAI_API_KEY is present.
TERMINUS_FAKE = (
    os.getenv("TERMINUS_FAKE", "false").strip().lower() in ("1", "true", "yes", "on")
    or not OPENAI_API_KEY
)

ENABLE_PLANNER_WEB_SEARCH = os.getenv("ENABLE_PLANNER_WEB_SEARCH", "false").lower() == "true"
ENABLE_PLANNER_FILE_SEARCH = os.getenv("ENABLE_PLANNER_FILE_SEARCH", "false").lower() == "true"
ENABLE_PLANNER_MCP = os.getenv("ENABLE_PLANNER_MCP", "false").lower() == "true"
PLANNER_STRICT_JSON = os.getenv("PLANNER_STRICT_JSON", "true").lower() == "true"

EXECUTOR_STRICT_FUNCTION = os.getenv("EXECUTOR_STRICT_FUNCTION", "true").lower() == "true"
# Allow falling back to free-text parsing when non-strict schema parsing fails.
# Default to false to keep executor output well-structured.
EXECUTOR_ALLOW_TEXT_FALLBACK = os.getenv("EXECUTOR_ALLOW_TEXT_FALLBACK", "false").lower() == "true"
# Optional regex for single-line bash CFG guard, defaults to permissive. Planning-only for now.
EXECUTOR_CFG_SINGLE_LINE = os.getenv("EXECUTOR_CFG_SINGLE_LINE", r"^.+$")

SAFETY_IDENTIFIER_PREFIX = os.getenv("SAFETY_IDENTIFIER_PREFIX", "terminus-")

# Models
PLANNER_MODEL = "gpt-5"
EXECUTOR_MODEL = "gpt-oss-20b"

# OpenAI client
client = OpenAI(api_key=OPENAI_API_KEY)


def _safety_tag(session_id: str) -> Dict[str, Any]:
    """Build metadata tag used by the model for safety correlation.

    The tag is propagated to Responses API requests to correlate
    model-side safety logs/metadata with a specific runtime session.
    """
    return {"safety_identifier": f"{SAFETY_IDENTIFIER_PREFIX}{session_id}"}


def _retry(fn, *, retries: int = 2, backoff: float = 0.75):
    """
    Retry fn() on transient API errors only.
    Do NOT retry invalid request errors (400-series schema/param issues).
    """
    last = None
    for i in range(retries + 1):
        try:
            return fn()
        except APIError as e:
            # Avoid retrying client-side invalid requests (commonly 400)
            status = getattr(e, "status_code", None)
            # Transient set: rate limit and server errors
            transient = {429, 500, 502, 503, 504}
            if status in transient:
                last = e
                if i == retries:
                    raise
                time.sleep(backoff * (2**i))
                continue
            # Non-transient -> re-raise immediately
            raise
        except Exception as e:
            # Unknown exception; treat as transient with backoff up to retries
            last = e
            if i == retries:
                raise
            time.sleep(backoff * (2**i))
    if last:
        raise last


def _responses_create_compat(kwargs: Dict[str, Any]):
    """
    Create a Responses request with compatibility fallbacks for SDKs that
    might not support newer optional fields (response_format, tools, etc.).

    Strategy: progressively drop optional keys on TypeError and retry.
    """
    optional_drop_order = [
        "response_format",
        "tools",
        "tool_choice",
        "reasoning",
        "text",
        "metadata",
        "previous_response_id",
    ]

    attempt_kwargs = dict(kwargs)
    for _ in range(len(optional_drop_order) + 1):
        try:
            return client.responses.create(**attempt_kwargs)
        except TypeError:
            if not optional_drop_order:
                raise
            # Drop the next optional key that exists in the kwargs
            dropped = False
            for key in list(optional_drop_order):
                if key in attempt_kwargs:
                    attempt_kwargs.pop(key, None)
                    optional_drop_order.remove(key)
                    dropped = True
                    break
            if not dropped:
                # Nothing left to drop -> re-raise
                raise


def _extract_output_text(response) -> str:
    """
    Best-effort extraction of assistant text from Responses API object.
    """
    out = []
    for item in getattr(response, "output", []) or []:
        content = getattr(item, "content", None)
        if not content:
            continue
        for c in content:
            if hasattr(c, "text") and c.text:
                out.append(c.text)
    # Some SDKs expose convenience property
    joined = "".join(out).strip()
    if joined:
        return joined
    # Fallback to output_text if present
    return getattr(response, "output_text", "") or ""


def _parse_plan_text_to_list(plan_text: str) -> List[str]:
    """
    Accepts either a JSON object string like {"plan": ["a","b"]} or plain-text bullet list.
    Returns list[str] of steps.
    """
    # Try JSON first
    try:
        parsed = json.loads(plan_text)
        if isinstance(parsed, dict) and "plan" in parsed and isinstance(parsed["plan"], list):
            # Ensure all items are strings
            return [str(x).strip() for x in parsed["plan"] if str(x).strip()]
        if isinstance(parsed, list):
            return [str(x).strip() for x in parsed if str(x).strip()]
    except Exception:
        pass

    # Plain text fallback: split lines, strip bullets/digits
    steps: List[str] = []
    for line in plan_text.splitlines():
        raw = line.strip()
        if not raw:
            continue
        # Remove common bullet/numbering prefixes
        for prefix in ("- ", "* ", "• ", "1. ", "2. ", "3. "):
            if raw.startswith(prefix):
                raw = raw[len(prefix) :]
        if raw:
            steps.append(raw)
    return steps


def _build_planner_tools(
    enable_search: bool,
    enable_file_search: bool,
    enable_mcp: bool,
    vector_store_ids: Optional[List[str]] = None,
    mcp_servers: Optional[List[Dict[str, Any]]] = None,
) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Construct tool and tool_choice payloads for the planner call.

    Returns the pair (tools, allowed_tool_choice). Tools are optional
    and controlled via environment toggles; allowed_tool_choice is the
    'tool_choice' object constraining which tools may be used.
    """
    tools: List[Dict[str, Any]] = []
    allowed: Optional[Dict[str, Any]] = None
    allow_names: List[Any] = []

    if enable_search:
        tools.append({"type": "web_search_preview"})
        # Use object form for allowed tools entries to satisfy Responses API schema
        allow_names.append({"type": "web_search_preview"})

    if enable_file_search:
        tools.append({"type": "file_search", "vector_store_ids": vector_store_ids or []})
        allow_names.append({"type": "file_search"})  # Allowed tools format can be names or objects

    if enable_mcp and mcp_servers:
        for srv in mcp_servers:
            # Expecting dicts like: {"server_label": "...", "server_url": "...", "require_approval": "never"}
            tools.append(
                {
                    "type": "mcp",
                    "server_label": srv.get("server_label"),
                    "server_url": srv.get("server_url"),
                    "require_approval": srv.get("require_approval", "never"),
                }
            )
            allow_names.append({"type": "mcp", "server_label": srv.get("server_label")})

    if allow_names:
        allowed = {"type": "allowed_tools", "mode": "auto", "tools": allow_names}

    return tools, allowed


def run_planner(
    user_goal: str,
    session_id: str,
    enable_search: Optional[bool] = None,
    vector_store_ids: Optional[List[str]] = None,
    mcp_servers: Optional[List[Dict[str, Any]]] = None,
    previous_response_id: Optional[str] = None,
) -> List[str]:
    """
    Call the planner model to get an initial plan list.

    Returns: list[str] of steps.
    """
    enable_search = ENABLE_PLANNER_WEB_SEARCH if enable_search is None else enable_search
    enable_file_search = ENABLE_PLANNER_FILE_SEARCH
    enable_mcp = ENABLE_PLANNER_MCP

    system_prompt = (
        "You are an expert DevOps and systems engineer Planner.\n"
        "Task: Decompose the user's goal into a minimal, correct step-by-step plan.\n"
        'Output STRICT JSON with a single key "plan": a JSON array of short, imperative steps.\n'
        "Do not include explanations, only the JSON object."
    )

    tools, allowed = _build_planner_tools(
        enable_search=enable_search,
        enable_file_search=enable_file_search,
        enable_mcp=enable_mcp,
        vector_store_ids=vector_store_ids,
        mcp_servers=mcp_servers,
    )

    def _call():
        kwargs: Dict[str, Any] = {
            "model": PLANNER_MODEL,
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_goal},
            ],
            "reasoning": {"effort": "medium"},
            "text": {"verbosity": "low"},
            "metadata": _safety_tag(session_id),
        }
        # Prefer strict structured JSON; fall back to freeform on unsupported cases
        if PLANNER_STRICT_JSON:
            kwargs["response_format"] = {"type": "json_schema", "json_schema": PLAN_SCHEMA}
        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = allowed
        if previous_response_id:
            kwargs["previous_response_id"] = previous_response_id

        return _responses_create_compat(kwargs)

    resp = _retry(_call)
    text = _extract_output_text(resp).strip()
    steps: List[str]
    if PLANNER_STRICT_JSON:
        try:
            obj = json.loads(text)
            # Strict path: expect obj to conform to PLAN_SCHEMA
            if isinstance(obj, dict) and isinstance(obj.get("plan"), list):
                steps = [str(x).strip() for x in obj["plan"] if str(x).strip()]
            else:
                steps = _parse_plan_text_to_list(text)
        except Exception:
            steps = _parse_plan_text_to_list(text)
    else:
        steps = _parse_plan_text_to_list(text)
    if not steps:
        # As a safety fallback, create a one-step plan.
        steps = [f"Analyze and begin: {user_goal}"]
    return steps


def _emit_bash_tools_cfg() -> List[Dict[str, Any]]:
    """
    Returns a strict function-calling tool that forces the model to return a single-line bash command.
    """
    return [
        {
            "type": "function",
            "name": "emit_bash",
            "description": "Return a single-line executable bash command for the given sub-task. No comments.",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "Single-line bash command. Must not contain newlines.",
                    }
                },
                "required": ["command"],
                "additionalProperties": False,
            },
            "strict": True,
        }
    ]


def _extract_function_call_command(resp) -> Optional[str]:
    """
    Extract the 'command' argument from a strict function call to emit_bash.
    Prefers top-level output items with type == 'function_call' and name == 'emit_bash'.
    Falls back to scanning nested content entries if needed.
    """
    output = getattr(resp, "output", []) or []

    # Preferred: top-level function_call items
    for item in output:
        if (
            getattr(item, "type", None) == "function_call"
            and getattr(item, "name", None) == "emit_bash"
        ):
            args = getattr(item, "arguments", None) or getattr(item, "args", None)
            if isinstance(args, str):
                try:
                    obj = json.loads(args)
                    return str(obj.get("command", "")).strip()
                except Exception:
                    pass
            elif isinstance(args, dict):
                return str(args.get("command", "")).strip()

    # Fallback: nested content entries that may contain a function call envelope
    for item in output:
        content = getattr(item, "content", None)
        if not content:
            continue
        for c in content:
            if getattr(c, "name", None) == "emit_bash":
                args = getattr(c, "arguments", None) or getattr(c, "args", None)
                if isinstance(args, str):
                    try:
                        obj = json.loads(args)
                        return str(obj.get("command", "")).strip()
                    except Exception:
                        pass
                elif isinstance(args, dict):
                    return str(args.get("command", "")).strip()

    return None


def _to_single_line(cmd: str) -> str:
    """Normalize a shell snippet to a single line.

    Collapses newlines and tabs to spaces and squashes excessive
    whitespace so downstream sandbox checks can rely on a stable,
    single-line representation.
    """
    single = " ".join(cmd.replace("\t", " ").replace("\r", " ").replace("\n", " ").split())
    return single.strip()


def run_executor(
    sub_task: str,
    session_id: str,
    strict_mode: Optional[bool] = None,
    previous_response_id: Optional[str] = None,
) -> str:
    """
    Translate a sub-task into a single-line executable bash command.

    Returns: single-line bash command as str.
    """
    # FAKE MODE: deterministic mappings from sub_task to one-line bash.
    if TERMINUS_FAKE:
        task = (sub_task or "").strip().lower()
        if "print hello" in task:
            return "echo hello"
        if "print completion" in task or "print done" in task:
            return "echo done"
        if "cause failure" in task:
            # Force non-zero exit to trigger error path
            return "bash -lc 'exit 1'"
        if "remediate" in task:
            return "echo remediate"
        # Default noop
        return "echo noop"

    strict = EXECUTOR_STRICT_FUNCTION if strict_mode is None else bool(strict_mode)

    system_prompt = (
        "You are a Translator. Output only one valid single-line bash command for the sub-task.\n"
        "No explanations, no comments, no multi-line, no prompts for confirmation."
    )

    def _call_text_only():
        kwargs: Dict[str, Any] = {
            "model": EXECUTOR_MODEL,
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": sub_task},
            ],
            "reasoning": {"effort": "minimal"},
            "text": {"verbosity": "low"},
            "metadata": _safety_tag(session_id),
        }
        if previous_response_id:
            kwargs["previous_response_id"] = previous_response_id
        return _responses_create_compat(kwargs)

    def _call_function_strict():
        tools = _emit_bash_tools_cfg()
        kwargs: Dict[str, Any] = {
            "model": EXECUTOR_MODEL,
            "input": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": sub_task},
            ],
            "reasoning": {"effort": "minimal"},
            "text": {"verbosity": "low"},
            "tools": tools,
            "tool_choice": {
                "type": "allowed_tools",
                "mode": "required",
                "tools": [{"type": "function", "name": "emit_bash"}],
            },
            "metadata": _safety_tag(session_id),
        }
        if previous_response_id:
            kwargs["previous_response_id"] = previous_response_id
        return _responses_create_compat(kwargs)

    if strict:
        resp = _retry(_call_function_strict)
        cmd = _extract_function_call_command(resp) or _extract_output_text(resp)
        cmd = _to_single_line(cmd)
    else:
        resp = _retry(_call_text_only)
        raw = _extract_output_text(resp)
        cmd = raw
        try:
            obj = json.loads(raw)
            if (
                isinstance(obj, dict)
                and isinstance(obj.get("command"), str)
                and obj.get("command", "").strip()
            ):
                cmd = obj["command"]
        except Exception:
            # Fallback to raw text when JSON parsing fails
            pass
        cmd = _to_single_line(cmd)

    return cmd
