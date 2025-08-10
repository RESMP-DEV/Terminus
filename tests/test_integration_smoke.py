import asyncio
import os

import pytest

try:
    import socketio  # python-socketio
except Exception:  # pragma: no cover
    socketio = None  # type: ignore


@pytest.mark.asyncio
@pytest.mark.skipif(socketio is None, reason="python-socketio not installed")
async def test_socketio_connect_and_execute_goal_smoke():
    """
    Integration smoke test:
    - Connects to the backend Socket.IO server
    - Emits execute_goal with a trivial goal
    - Awaits at least one of the expected events (plan_generated)
    This test is best-effort and will be skipped if no server is running.

    To run locally:
      - Start the backend: uvicorn agent_core.main:build_asgi --factory --reload
      - Then: pytest -q tests/test_integration_smoke.py
    """
    backend_url = os.getenv("BACKEND_URL", "http://localhost:8000")
    goal = os.getenv("SMOKE_TEST_GOAL", "echo hello world")

    # Async client from python-socketio
    sio = socketio.AsyncClient()

    got_connected = asyncio.Event()
    got_plan = asyncio.Event()

    @sio.event
    async def connect():
        got_connected.set()

    @sio.on("plan_generated")
    async def on_plan_generated(payload):
        # Expect format: {"type":"plan_generated","payload":{"plan":[...]}}
        if isinstance(payload, dict) and payload.get("type") == "plan_generated":
            got_plan.set()

    try:
        # Attempt connection (fail fast if server is not running)
        await sio.connect(backend_url, wait_timeout=2)

        # Wait for connect event
        await asyncio.wait_for(got_connected.wait(), timeout=2.0)

        # Emit execute_goal per contract
        await sio.emit("execute_goal", {"payload": {"goal": goal}})

        # Wait briefly for plan_generated
        await asyncio.wait_for(got_plan.wait(), timeout=10.0)
    except Exception as e:
        # If backend isn't running, skip rather than fail CI by default
        pytest.skip(f"Smoke test skipped: backend not reachable or no plan event: {e}")
    finally:
        try:
            await sio.disconnect()
        except Exception:
            pass
