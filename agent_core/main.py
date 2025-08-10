import asyncio
import json
import os
import platform

# System checks
import pwd
import time
import uuid
from typing import Any, Dict, List

import socketio
import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Response, WebSocket

# Metrics
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import ValidationError

from agent_core import api_client, sandbox

# Internal modules
from agent_core.types import (
    ErrorDetectedPayload,
    ExecuteGoalPayload,
    PlanGeneratedPayload,
    RePlanningPayload,
    StepExecutingPayload,
    StepResultPayload,
    WorkflowCompletePayload,
)

# ---- Utility coercion helpers (silence typing issues for sandbox result dicts) ----


def _safe_int(value: object, default: int = -1) -> int:
    """Best-effort conversion to int; returns default on failure."""
    try:
        if isinstance(value, (int,)):
            return int(value)
        if isinstance(value, str):
            return int(value) if value.strip().lstrip("-").isdigit() else default
        # Accept objects that implement __int__
        return int(value)  # type: ignore
    except Exception:
        return default


def _safe_str(value: object, default: str = "") -> str:
    """Best-effort conversion to str; returns default on failure or None."""
    try:
        if value is None:
            return default
        return str(value)
    except Exception:
        return default


# ---- Configuration & Logging ----

load_dotenv()

logger = structlog.get_logger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
SANDBOX_USER = os.getenv("SANDBOX_USER", "sandboxuser")
SANDBOX_SKIP_USER_CHECK = os.getenv("SANDBOX_SKIP_USER_CHECK", "").strip().lower() in (
    "1",
    "true",
    "yes",
    "on",
)

# Validate minimal runtime prerequisites early
_RUNTIME_READY = True
_RUNTIME_ISSUES: List[str] = []

if not OPENAI_API_KEY:
    _RUNTIME_READY = False
    _RUNTIME_ISSUES.append("OPENAI_API_KEY is not set")

if not SANDBOX_SKIP_USER_CHECK:
    try:
        pwd.getpwnam(SANDBOX_USER)
    except KeyError:
        _RUNTIME_ISSUES.append(
            f"Sandbox user '{SANDBOX_USER}' not found; sandbox execution may fail"
        )
        # Not fatal to start, but warn
        logger.warning("sandbox_user_missing", user=SANDBOX_USER)
else:
    logger.info("sandbox_user_check_skipped", user=SANDBOX_USER)

# Structlog config (simple JSON)
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)

# ---- Stage logging helper ----


def _stage_log(event: str, stage: str, **kwargs: Any) -> None:
    """Emit a lightweight, consistent stage log event.

    Examples:
      _stage_log("stage_enter", "planner", sid=sid, session_id=session_id)
      _stage_log("stage_exit", "sandbox", sid=sid, exit_code=0)
    """
    logger.info(event, stage=stage, **kwargs)


# ---- Cross-platform command normalization ----


def _normalize_command_for_os(command: str) -> str:
    """Normalize shell commands to the current OS to avoid mixed shells.

    Policy:
    - On non-Windows (Linux/macOS), translate common PowerShell/Windows-only commands
      to safe Unix equivalents. Minimal mapping per requirements.
    - On Windows, allow PowerShell cmdlets; optionally translate basic Unix ls to PS.
    """
    try:
        sys_name = platform.system().lower()
    except Exception:
        sys_name = ""

    original = command
    normalized = command
    lower = command.strip().lower()

    if sys_name != "windows":
        # Map Windows/PowerShell directory listings to Unix equivalent
        if lower.startswith("get-childitem") or lower.startswith("gci") or lower.startswith("dir"):
            normalized = "ls -la"
    else:
        # On Windows, if an agent produced Unix 'ls', map to a roughly equivalent PS cmdlet
        if lower.startswith("ls"):
            normalized = "Get-ChildItem -Force"

    if normalized != original:
        logger.info("command_normalized", source=original, target=normalized, os=sys_name)
    return normalized


# ---- Metrics ----

REQUESTS_EXECUTE_GOAL = Counter(
    "engine_execute_goal_requests_total",
    "Total execute_goal requests received",
)
STEPS_EXECUTED = Counter(
    "engine_steps_executed_total",
    "Total sub-steps executed (attempted)",
)
STEPS_FAILED = Counter(
    "engine_steps_failed_total",
    "Total sub-steps failed (non-zero exit or executor error)",
)
PLANNER_LATENCY = Histogram(
    "engine_planner_seconds",
    "Planner call latency (seconds)",
    buckets=(0.2, 0.5, 1, 2, 5, 10, 30, 60),
)
EXECUTOR_LATENCY = Histogram(
    "engine_executor_seconds",
    "Executor call latency (seconds)",
    buckets=(0.05, 0.1, 0.2, 0.5, 1, 2, 5),
)
SANDBOX_LATENCY = Histogram(
    "engine_sandbox_seconds",
    "Sandbox execution latency (seconds)",
    buckets=(0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30),
)

# ---- Error Taxonomy ----


def _cat(msg: str, category: str) -> str:
    # Prefix message with category while keeping API contract unchanged
    return f"[{category}] {msg}"


# ---- Server (FastAPI + Socket.IO) ----

# Socket.IO server (ASGI)
# Allow tuning heartbeat to mitigate jittery networks
_PING_TIMEOUT_MS = int(os.getenv("SOCKET_PING_TIMEOUT_MS", "25000"))
_PING_INTERVAL_MS = int(os.getenv("SOCKET_PING_INTERVAL_MS", "20000"))
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    ping_timeout=_PING_TIMEOUT_MS / 1000.0,
    ping_interval=_PING_INTERVAL_MS / 1000.0,
)
app = FastAPI()
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)


# Health/Readiness endpoints
@app.get("/healthz")
async def healthz():
    return {"status": "ok"}


@app.get("/readyz")
async def readyz():
    status = "ready" if _RUNTIME_READY else "degraded"
    return {"status": status, "issues": _RUNTIME_ISSUES}


@app.get("/metrics")
async def metrics():
    data = generate_latest()  # type: ignore
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


# Optional raw WebSocket endpoint for diagnostics
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    await ws.send_text(
        json.dumps({"type": "status", "payload": {"message": "raw websocket online"}})
    )
    try:
        while True:
            data = await ws.receive_text()
            await ws.send_text(json.dumps({"type": "echo", "payload": {"message": data}}))
    except Exception:
        await ws.close()


# ---- Session / Rate limiting / Limits ----


def new_session_id() -> str:
    return uuid.uuid4().hex[:12]


# Simple per-socket rate limiter in-memory
_last_exec_ts: Dict[str, float] = {}
MIN_EXECUTE_GOAL_INTERVAL_SEC = float(os.getenv("EXECUTE_GOAL_MIN_INTERVAL_SEC", "2.0"))

# Max payload size guard for goal
MAX_GOAL_LEN = int(os.getenv("MAX_GOAL_LEN", "2000"))

# Track running tasks per socket for cooperative cancellation
_RUNNING_TASKS: Dict[str, asyncio.Task] = {}

# ---- Event helpers ----


async def emit_json(event_type: str, payload: Dict[str, Any], sid: str):
    await sio.emit(event_type, {"type": event_type, "payload": payload}, to=sid)


# ---- Lifecycle ----


@app.on_event("startup")
async def _on_startup():
    logger.info("engine_startup", ready=_RUNTIME_READY, issues=_RUNTIME_ISSUES)


@app.on_event("shutdown")
async def _on_shutdown():
    # Graceful shutdown: cancel all running workflows
    logger.info("engine_shutdown_begin", running=len(_RUNNING_TASKS))
    for sid, task in list(_RUNNING_TASKS.items()):
        if not task.done():
            task.cancel()
    # Give tasks a moment to cancel
    await asyncio.sleep(0.1)
    logger.info("engine_shutdown_end")


# ---- Socket.IO handlers ----


@sio.event
async def connect(sid, environ):
    logger.info("socket_connected", sid=sid)
    await emit_json("status", {"message": "connected"}, sid)


@sio.event
async def disconnect(sid):
    logger.info("socket_disconnected", sid=sid)
    # Cancel any running workflow tied to this socket
    task = _RUNNING_TASKS.pop(sid, None)
    if task and not task.done():
        task.cancel()


# Contract: {"type": "execute_goal", "payload": {"goal": "..."}}
@sio.event
async def execute_goal(sid, data):
    REQUESTS_EXECUTE_GOAL.inc()

    # Prevent concurrent workflows on same socket: cancel previous if running
    prev = _RUNNING_TASKS.get(sid)
    if prev and not prev.done():
        prev.cancel()
        await asyncio.sleep(0)  # yield to allow cancellation

    # Rate limit per socket
    now = time.time()
    last = _last_exec_ts.get(sid, 0.0)
    if now - last < MIN_EXECUTE_GOAL_INTERVAL_SEC:
        msg = f"Rate limit: wait {MIN_EXECUTE_GOAL_INTERVAL_SEC - (now - last):.1f}s"
        logger.warning("rate_limited", sid=sid, min_interval=MIN_EXECUTE_GOAL_INTERVAL_SEC)
        await emit_json(
            "error_detected",
            ErrorDetectedPayload(
                error=_cat(msg, "rate_limit"), failed_step="rate_limit"
            ).model_dump(),
            sid,
        )
        return
    _last_exec_ts[sid] = now

    # Validate shape
    try:
        if not isinstance(data, dict):
            raise ValueError("Invalid data, expected object with payload")
        payload = data.get("payload", {})
        req = ExecuteGoalPayload(**payload)
    except (ValidationError, ValueError) as e:
        logger.warning("invalid_execute_goal_payload", sid=sid, error=str(e))
        await emit_json(
            "error_detected",
            ErrorDetectedPayload(
                error=_cat(f"Invalid execute_goal payload: {e}", "validation"),
                failed_step="validate",
            ).model_dump(),
            sid,
        )
        return

    goal = (req.goal or "").strip()
    if not goal:
        await emit_json(
            "error_detected",
            ErrorDetectedPayload(
                error=_cat("Goal must be a non-empty string", "validation"),
                failed_step="validate",
            ).model_dump(),
            sid,
        )
        return
    if len(goal) > MAX_GOAL_LEN:
        await emit_json(
            "error_detected",
            ErrorDetectedPayload(
                error=_cat(f"Goal too long (>{MAX_GOAL_LEN} chars)", "validation"),
                failed_step="validate",
            ).model_dump(),
            sid,
        )
        return

    async def _workflow():
        session_id = new_session_id()
        logger.info("execute_goal_received", sid=sid, session_id=session_id, goal_len=len(goal))
        try:
            # Planning
            try:
                with PLANNER_LATENCY.time():
                    plan_list: List[str] = await asyncio.to_thread(
                        api_client.run_planner,
                        user_goal=goal,
                        session_id=session_id,
                    )
            except Exception as e:
                logger.error("planner_error", sid=sid, session_id=session_id, error=str(e))
                await emit_json(
                    "error_detected",
                    ErrorDetectedPayload(
                        error=_cat(f"Planner error: {e}", "planner"),
                        failed_step="planning",
                    ).model_dump(),
                    sid,
                )
                return

            # Announce plan
            await emit_json(
                "plan_generated",
                PlanGeneratedPayload(plan=plan_list).model_dump(),
                sid,
            )

            # Execute steps sequentially with re-planning on error
            history: List[Dict[str, Any]] = []
            step_index = 0

            while step_index < len(plan_list):
                # Yield control periodically for cancellation responsiveness
                await asyncio.sleep(0)

                step = plan_list[step_index]

                # Translate to bash command
                try:
                    start_exec = time.time()
                    with EXECUTOR_LATENCY.time():
                        command = await asyncio.to_thread(
                            api_client.run_executor,
                            sub_task=step,
                            session_id=session_id,
                            strict_mode=True,
                        )
                        # Normalize cross-platform commands to avoid mixing Windows-only cmdlets on Unix
                        norm_command = _normalize_command_for_os(command)
                        # Short-circuit steps that try to open GUI terminals or use Windows-only shells
                        forbidden_prefixes = (
                            "open -a Terminal",  # macOS GUI app
                            "cmd ",
                            "cmd.exe",
                            "start ",
                            "powershell",
                        )
                        if any(command.lower().startswith(pfx) for pfx in forbidden_prefixes):
                            raise RuntimeError(f"forbidden command: {command}")
                    logger.info(
                        "executor_command",
                        sid=sid,
                        session_id=session_id,
                        step_index=step_index,
                        step=step,
                        command=norm_command,
                        latency=time.time() - start_exec,
                    )
                except Exception as e:
                    logger.error(
                        "executor_error",
                        sid=sid,
                        session_id=session_id,
                        step=step,
                        error=str(e),
                    )
                    await emit_json(
                        "error_detected",
                        ErrorDetectedPayload(
                            error=_cat(f"Executor error: {e}", "executor"),
                            failed_step=step,
                        ).model_dump(),
                        sid,
                    )
                    # Attempt re-planning
                    await emit_json("re_planning", RePlanningPayload().model_dump(), sid)
                    try:
                        revised_goal = (
                            f"Revise plan after failure.\nOriginal goal: {goal}\nFailed step: {step}\n"
                            f"Error: {e}\nHistory: {json.dumps(history)[:4000]}"
                        )
                        with PLANNER_LATENCY.time():
                            plan_list = await asyncio.to_thread(
                                api_client.run_planner,
                                user_goal=revised_goal,
                                session_id=session_id,
                            )
                        step_index = 0
                        await emit_json(
                            "plan_generated",
                            PlanGeneratedPayload(plan=plan_list).model_dump(),
                            sid,
                        )
                        continue
                    except Exception as e2:
                        logger.error(
                            "replanning_failed",
                            sid=sid,
                            session_id=session_id,
                            error=str(e2),
                        )
                        await emit_json(
                            "error_detected",
                            ErrorDetectedPayload(
                                error=_cat(f"Re-planning failed: {e2}", "planner"),
                                failed_step=step,
                            ).model_dump(),
                            sid,
                        )
                        return

                # Notify UI of step executing + command
                await emit_json(
                    "step_executing",
                    StepExecutingPayload(step=step, command=norm_command).model_dump(),
                    sid,
                )

                # Execute in sandbox
                STEPS_EXECUTED.inc()
                start_sbx = time.time()
                with SANDBOX_LATENCY.time():
                    result = sandbox.execute_command(norm_command)

                # Emit results
                await emit_json(
                    "step_result",
                    StepResultPayload(
                        stdout=_safe_str(result.get("stdout", "")),
                        stderr=_safe_str(result.get("stderr", "")),
                        exit_code=_safe_int(result.get("exit_code", -1)),
                    ).model_dump(),
                    sid,
                )

                # Record history
                history.append(
                    {
                        "step": step,
                        "command": norm_command,
                        "stdout": _safe_str(result.get("stdout", "")),
                        "stderr": _safe_str(result.get("stderr", "")),
                        "exit_code": _safe_int(result.get("exit_code", -1)),
                        "sandbox_latency": time.time() - start_sbx,
                    }
                )

                # Error -> re-plan
                if _safe_int(result.get("exit_code", -1)) != 0:
                    STEPS_FAILED.inc()
                    logger.warning(
                        "step_failed",
                        sid=sid,
                        session_id=session_id,
                        step_index=step_index,
                        step=step,
                        exit_code=result.get("exit_code"),
                    )
                    await emit_json(
                        "error_detected",
                        ErrorDetectedPayload(
                            error=_cat(
                                _safe_str(result.get("stderr", ""))[:2000] or "unknown error",
                                "sandbox",
                            ),
                            failed_step=step,
                        ).model_dump(),
                        sid,
                    )

                    await emit_json("re_planning", RePlanningPayload().model_dump(), sid)
                    try:
                        revised_goal = (
                            f"Re-plan after command failure.\nOriginal goal: {goal}\n"
                            f"Failed step: {step}\nCommand: {command}\n"
                            f"stderr: {_safe_str(result.get('stderr',''))[:2000]}\n"
                            f"History: {json.dumps(history)[:4000]}"
                        )
                        with PLANNER_LATENCY.time():
                            plan_list = await asyncio.to_thread(
                                api_client.run_planner,
                                user_goal=revised_goal,
                                session_id=session_id,
                            )
                        step_index = 0
                        await emit_json(
                            "plan_generated",
                            PlanGeneratedPayload(plan=plan_list).model_dump(),
                            sid,
                        )
                        continue
                    except Exception as e:
                        logger.error(
                            "replanning_failed",
                            sid=sid,
                            session_id=session_id,
                            error=str(e),
                        )
                        await emit_json(
                            "error_detected",
                            ErrorDetectedPayload(
                                error=_cat(f"Re-planning failed: {e}", "planner"),
                                failed_step=step,
                            ).model_dump(),
                            sid,
                        )
                        return

                # Advance to next step
                step_index += 1

            # Workflow complete
            await emit_json(
                "workflow_complete",
                WorkflowCompletePayload(status="success").model_dump(),
                sid,
            )
            logger.info("workflow_complete", sid=sid, session_id=session_id)

        except asyncio.CancelledError:
            # Cooperative cancellation
            logger.info("workflow_cancelled", sid=sid)
            await emit_json(
                "error_detected",
                ErrorDetectedPayload(
                    error=_cat("Workflow cancelled", "cancelled"), failed_step="cancel"
                ).model_dump(),
                sid,
            )
            raise

        finally:
            # Cleanup registry
            t = _RUNNING_TASKS.get(sid)
            if t and t is asyncio.current_task():
                _RUNNING_TASKS.pop(sid, None)

    # Spawn workflow task and await completion (allows cancellation on disconnect/shutdown)
    task = asyncio.create_task(_workflow(), name=f"workflow:{sid}")
    _RUNNING_TASKS[sid] = task
    try:
        await task
    except asyncio.CancelledError:
        # Already handled inside _workflow
        pass


# Entrypoint helper for uvicorn
def build_asgi():
    """
    Returns the ASGI app (Socket.IO wrapped FastAPI) for uvicorn.
    Example: uvicorn agent_core.main:build_asgi --factory --reload
    """
    return sio_app
