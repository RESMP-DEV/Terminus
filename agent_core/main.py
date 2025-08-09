import asyncio
import json
import os
import uuid
from typing import Any, Dict, List

import socketio
from fastapi import FastAPI, WebSocket
from pydantic import ValidationError
from dotenv import load_dotenv

# Internal modules
from agent_core.types import (
    ExecuteGoalPayload,
    PlanGeneratedPayload,
    StepExecutingPayload,
    StepResultPayload,
    ErrorDetectedPayload,
    RePlanningPayload,
    WorkflowCompletePayload,
)
from agent_core import sandbox
from agent_core import api_client

load_dotenv()

# Socket.IO server (ASGI)
sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins="*")
app = FastAPI()
sio_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Optional raw WebSocket endpoint for diagnostics
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    await ws.send_text(json.dumps({"type": "status", "payload": {"message": "raw websocket online"}}))
    try:
        while True:
            data = await ws.receive_text()
            await ws.send_text(json.dumps({"type": "echo", "payload": {"message": data}}))
    except Exception:
        await ws.close()


# Event helpers to ensure strict payloads
async def emit_json(event_type: str, payload: Dict[str, Any], sid: str):
    await sio.emit(event_type, {"type": event_type, "payload": payload}, to=sid)


def new_session_id() -> str:
    return uuid.uuid4().hex[:12]


# Socket.IO event handlers
@sio.event
async def connect(sid, environ):
    await emit_json("status", {"message": "connected"}, sid)


@sio.event
async def disconnect(sid):
    # No-op
    pass


# Contract: {"type": "execute_goal", "payload": {"goal": "..."}}
@sio.event
async def execute_goal(sid, data):
    # Validate shape
    try:
        if not isinstance(data, dict):
            raise ValueError("Invalid data")
        payload = data.get("payload", {})
        req = ExecuteGoalPayload(**payload)
    except (ValidationError, ValueError) as e:
        await emit_json(
            "error_detected",
            ErrorDetectedPayload(error=f"Invalid execute_goal payload: {e}", failed_step="validate").model_dump(),
            sid,
        )
        return

    # Generate session and history
    session_id = new_session_id()
    goal = req.goal

    # Planning
    try:
        plan_list: List[str] = api_client.run_planner(
            user_goal=goal,
            session_id=session_id,
        )
    except Exception as e:
        await emit_json(
            "error_detected",
            ErrorDetectedPayload(error=f"Planner error: {e}", failed_step="planning").model_dump(),
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
        step = plan_list[step_index]

        # Translate to bash command
        try:
            command = api_client.run_executor(
                sub_task=step,
                session_id=session_id,
                strict_mode=True,
            )
        except Exception as e:
            await emit_json(
                "error_detected",
                ErrorDetectedPayload(error=f"Executor error: {e}", failed_step=step).model_dump(),
                sid,
            )
            # Attempt re-planning
            await emit_json("re_planning", RePlanningPayload().model_dump(), sid)
            try:
                # Provide context to planner (serialize history + last error)
                revised_goal = f"Revise plan after failure.\nOriginal goal: {goal}\nFailed step: {step}\nError: {e}\nHistory: {json.dumps(history)[:4000]}"
                plan_list = api_client.run_planner(
                    user_goal=revised_goal,
                    session_id=session_id,
                )
                step_index = 0
                await emit_json("plan_generated", PlanGeneratedPayload(plan=plan_list).model_dump(), sid)
                continue
            except Exception as e2:
                await emit_json(
                    "error_detected",
                    ErrorDetectedPayload(error=f"Re-planning failed: {e2}", failed_step=step).model_dump(),
                    sid,
                )
                return

        # Notify UI of step executing + command
        await emit_json(
            "step_executing",
            StepExecutingPayload(step=step, command=command).model_dump(),
            sid,
        )

        # Execute in sandbox
        result = sandbox.execute_command(command)

        # Emit results
        await emit_json(
            "step_result",
            StepResultPayload(
                stdout=result.get("stdout", ""),
                stderr=result.get("stderr", ""),
                exit_code=int(result.get("exit_code", -1)),
            ).model_dump(),
            sid,
        )

        # Record history
        history.append(
            {
                "step": step,
                "command": command,
                "stdout": result.get("stdout", ""),
                "stderr": result.get("stderr", ""),
                "exit_code": int(result.get("exit_code", -1)),
            }
        )

        # Error -> re-plan
        if int(result.get("exit_code", -1)) != 0:
            await emit_json(
                "error_detected",
                ErrorDetectedPayload(
                    error=result.get("stderr", "")[:2000] or "unknown error",
                    failed_step=step,
                ).model_dump(),
                sid,
            )

            await emit_json("re_planning", RePlanningPayload().model_dump(), sid)
            try:
                revised_goal = (
                    f"Re-plan after command failure.\nOriginal goal: {goal}\n"
                    f"Failed step: {step}\nCommand: {command}\n"
                    f"stderr: {result.get('stderr','')[:2000]}\n"
                    f"History: {json.dumps(history)[:4000]}"
                )
                plan_list = api_client.run_planner(
                    user_goal=revised_goal,
                    session_id=session_id,
                )
                step_index = 0
                await emit_json("plan_generated", PlanGeneratedPayload(plan=plan_list).model_dump(), sid)
                continue
            except Exception as e:
                await emit_json(
                    "error_detected",
                    ErrorDetectedPayload(error=f"Re-planning failed: {e}", failed_step=step).model_dump(),
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


# Entrypoint helper for uvicorn
def build_asgi():
    """
    Returns the ASGI app (Socket.IO wrapped FastAPI) for uvicorn.
    Example: uvicorn agent_core.main:build_asgi --factory --reload
    """
    return sio_app