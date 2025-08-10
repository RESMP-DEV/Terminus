#!/usr/bin/env python3
"""
CLI Demo: exercise Terminus core loop without UI.

Usage:
  # Terminal 1: start backend
  #   uvicorn agent_core.main:build_asgi --factory --reload --host 0.0.0.0 --port 8000
  #
  # Terminal 2: run demo (uses BACKEND_URL and GOAL envs optionally)
  #   python scripts/run_demo.py
  #   BACKEND_URL=http://localhost:8000 GOAL="list files" python scripts/run_demo.py
  #
  # To avoid real OpenAI calls, enable fake mode:
  #   export TERMINUS_FAKE=true  (and restart backend)
"""

import asyncio
import os
import sys
from typing import Any, Dict

try:
    import socketio  # python-socketio
except Exception:
    print(
        "ERROR: python-socketio is not installed. pip install -r requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")
GOAL = os.getenv("GOAL", "print hello -> cause failure -> remediate -> done")


async def main() -> int:
    sio = socketio.AsyncClient()

    async def pprint_event(name: str, payload: Dict[str, Any]):
        print(f"\n== {name} ==")
        try:
            if isinstance(payload, dict) and "type" in payload and "payload" in payload:
                print(payload["type"])
                print(payload["payload"])
            else:
                print(payload)
        except Exception as e:
            print(f"(error printing payload) {e}")

    async def on_status(payload):
        await pprint_event("status", payload)

    async def on_plan_generated(payload):
        await pprint_event("plan_generated", payload)

    async def on_step_executing(payload):
        await pprint_event("step_executing", payload)

    async def on_step_result(payload):
        await pprint_event("step_result", payload)

    async def on_error_detected(payload):
        await pprint_event("error_detected", payload)

    async def on_replanning(payload):
        await pprint_event("re_planning", payload)

    async def on_workflow_complete(payload):
        await pprint_event("workflow_complete", payload)
        # Auto-disconnect after completion
        try:
            await sio.disconnect()
        except Exception:
            pass

    @sio.event
    async def connect():
        print(f"Connected to {BACKEND_URL}")

    @sio.event
    async def disconnect():
        print("Disconnected")

    sio.on("status", on_status)
    sio.on("plan_generated", on_plan_generated)
    sio.on("step_executing", on_step_executing)
    sio.on("step_result", on_step_result)
    sio.on("error_detected", on_error_detected)
    sio.on("re_planning", on_replanning)
    sio.on("workflow_complete", on_workflow_complete)

    try:
        await sio.connect(BACKEND_URL, wait_timeout=10)
        # Emit the goal per contract
        await sio.emit("execute_goal", {"payload": {"goal": GOAL}})
        # Keep loop alive until disconnect
        await sio.wait()
        return 0
    except Exception as e:
        print(f"ERROR: Unable to run demo: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
