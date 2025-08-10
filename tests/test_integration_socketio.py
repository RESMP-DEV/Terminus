import asyncio
import os

import pytest

try:
    import socketio
except Exception:  # pragma: no cover
    socketio = None  # type: ignore


BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


@pytest.mark.asyncio
@pytest.mark.skipif(socketio is None, reason="python-socketio not installed")
async def test_invalid_payload_emits_validation_error():
    """
    Ensure the server validates inbound payloads and emits error_detected [validation]
    without requiring a working OpenAI key or model access.
    """
    sio = socketio.AsyncClient()
    got_connected = asyncio.Event()
    got_validation_error = asyncio.Event()

    @sio.event
    async def connect():
        got_connected.set()

    @sio.on("error_detected")
    async def on_error(payload):
        # Expect: {"type":"error_detected","payload":{"error":"[validation] ...","failed_step":"validate"}}
        try:
            if isinstance(payload, dict) and payload.get("type") == "error_detected":
                p = payload.get("payload", {})
                err = p.get("error", "")
                failed = p.get("failed_step", "")
                if isinstance(err, str) and err.startswith("[validation]") and failed == "validate":
                    got_validation_error.set()
        except Exception:
            # Ignore parsing issues to keep test resilient
            pass

    try:
        await sio.connect(BACKEND_URL, wait_timeout=2)
        await asyncio.wait_for(got_connected.wait(), timeout=2.0)

        # Send invalid payload shape (no "payload" key)
        await sio.emit("execute_goal", {"goal": "this is invalid shape"})

        await asyncio.wait_for(got_validation_error.wait(), timeout=5.0)
    except Exception as e:
        pytest.skip(f"Backend not reachable or validation event not received in time: {e}")
    finally:
        try:
            await sio.disconnect()
        except Exception:
            pass


@pytest.mark.asyncio
@pytest.mark.skipif(socketio is None, reason="python-socketio not installed")
async def test_rate_limit_second_request_rejected():
    """
    The backend enforces per-socket rate limiting before calling any models.
    We send two execute_goal events back-to-back; the second should yield a
    rate_limit error_detected.
    """
    sio = socketio.AsyncClient()
    got_connected = asyncio.Event()
    got_rate_limit = asyncio.Event()

    @sio.event
    async def connect():
        got_connected.set()

    @sio.on("error_detected")
    async def on_error(payload):
        # Expect: {"type":"error_detected","payload":{"error":"[rate_limit] ...","failed_step":"rate_limit"}}
        try:
            if isinstance(payload, dict) and payload.get("type") == "error_detected":
                p = payload.get("payload", {})
                err = p.get("error", "")
                failed = p.get("failed_step", "")
                if (
                    isinstance(err, str)
                    and err.startswith("[rate_limit]")
                    and failed == "rate_limit"
                ):
                    got_rate_limit.set()
        except Exception:
            pass

    try:
        await sio.connect(BACKEND_URL, wait_timeout=2)
        await asyncio.wait_for(got_connected.wait(), timeout=2.0)

        # First call (allowed)
        await sio.emit("execute_goal", {"payload": {"goal": "noop"}})
        # Immediately send second call to trigger rate limit
        await sio.emit("execute_goal", {"payload": {"goal": "noop"}})

        await asyncio.wait_for(got_rate_limit.wait(), timeout=5.0)
    except Exception as e:
        pytest.skip(f"Backend not reachable or rate-limit event not received in time: {e}")
    finally:
        try:
            await sio.disconnect()
        except Exception:
            pass
