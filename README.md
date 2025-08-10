# Terminus Engine (State & Feedback Loop)

End-to-end runtime for planning → execution → feedback with sandboxed command execution and real-time UI updates. Backend uses FastAPI with Socket.IO, OpenAI Responses API (GPT‑5 family), and a dedicated sandbox user for subprocess execution.

Quick links
- Engine Plan: [plan.md](plan.md)
- Sandbox script: [sandbox/setup_sandbox.sh](sandbox/setup_sandbox.sh)
- Sandbox executor: [agent_core/sandbox.py](agent_core/sandbox.py)
- OpenAI client wrapper: [agent_core/api_client.py](agent_core/api_client.py)
- Runtime server: [agent_core/main.py](agent_core/main.py)
- Message types: [agent_core/types.py](agent_core/types.py)
- Orchestrator: [agent_core/orchestrator.py](agent_core/orchestrator.py)
- Executor: [agent_core/executor.py](agent_core/executor.py)
- Optional Agents SDK runtime: [agent_core_sdk/](agent_core_sdk/)
- UI scaffolding (to be connected): ui/

Tech stack
- Backend: FastAPI + Socket.IO (python-socketio ASGI)
- Model API: OpenAI Responses API (gpt‑5 for planning, gpt‑5‑nano for command translation); optional OpenAI Agents SDK runtime
- Command execution: Python subprocess under restricted sandbox user
- Config: .env (dotenv)
- Validation: Pydantic (payload schemas)
- Logging/Metrics: structlog, prometheus-client (placeholders for future enhancement)

Directory structure
- /agent_core
  - main.py: Socket.IO server, core workflow loop
  - api_client.py: OpenAI Responses API calls for planner/executor
  - sandbox.py: subprocess.run wrapper that executes as low-privilege user
  - types.py: Pydantic models for API contract events
  - orchestrator.py: planner delegation and re-planning
  - executor.py: strict single-line bash emission wrapper
- /sandbox
  - setup_sandbox.sh: creates restricted user and installs tools
- /ui
  - React (Vite) app to consume Socket.IO events (to be wired to backend)
- plan.md: Architecture and API/tooling decisions
- requirements.txt: Backend dependencies
- .env.example: Configuration template

Prerequisites
- Linux host with sudo
- Python 3.10+
- An OpenAI API key with access to GPT‑5 models

Setup

1) Create virtual environment and install dependencies
- python3 -m venv .venv
- source .venv/bin/activate
- pip install -r requirements.txt

2) Configure environment
- cp .env.example .env
- Edit .env and set OPENAI_API_KEY and other toggles as needed

Environment variables (.env)
- OPENAI_API_KEY= your api key
- SAFETY_IDENTIFIER_PREFIX= terminus- (prefixed to session id for safety tagging)
- ENABLE_PLANNER_WEB_SEARCH= false|true (optional)
- ENABLE_PLANNER_FILE_SEARCH= false|true (optional)
- ENABLE_PLANNER_MCP= false|true (optional)
- EXECUTOR_STRICT_FUNCTION= true|false (use function-calling to constrain executor)
- EXECUTOR_CFG_SINGLE_LINE= "^.*$" (regex guard for single-line; currently advisory)
- SOCKET_TRANSPORT= socketio (default)
- SANDBOX_USER= sandboxuser (must exist or be created by setup script)

3) Provision the sandbox user (recommended)
- bash sandbox/setup_sandbox.sh
Notes:
- Creates a low-privilege user (sandboxuser) and installs git, python3, pip, curl, wget, build-essential
- The runtime executes commands with sudo -u sandboxuser; ensure non-interactive sudo is permitted for the service user running the server (NOPASSWD for sudo -u sandboxuser bash -c "<cmd>" if required by your environment policy)

Run the backend

Option A: Factory entrypoint (recommended)
- uvicorn agent_core.main:build_asgi --factory --reload --host 0.0.0.0 --port 8000

This serves:
- Socket.IO over HTTP at http://localhost:8000 (Socket.IO endpoint)
- Raw WebSocket diagnostics at ws://localhost:8000/ws (echo/status only)

Option B: One-liner (loads .env automatically)

The backend calls dotenv's load_dotenv on startup, so variables in `.env` are picked up automatically. You can start the server with a single command (example path shown for this repo location):

```
cd /Users/tingyuzhang/Desktop/hackathon/Terminus && . .venv/bin/activate 2>/dev/null || true && python -m uvicorn agent_core.main:build_asgi --factory --host 127.0.0.1 --port 8000 --reload
```

Socket.IO contract

Incoming (Client → Server)
- Event: execute_goal
  - Payload: {"payload":{"goal":"user's complex task"}}

Outgoing (Server → Client)
- plan_generated
  - {"type":"plan_generated","payload":{"plan":["task1","task2",...]}}
- step_executing
  - {"type":"step_executing","payload":{"step":"task1","command":"bash command"}}
- step_result
  - {"type":"step_result","payload":{"stdout":"...","stderr":"...","exit_code":0}}
- error_detected
  - {"type":"error_detected","payload":{"error":"...","failed_step":"..."}}
- re_planning
  - {"type":"re_planning","payload":{}}
- workflow_complete
  - {"type":"workflow_complete","payload":{"status":"success"}}

Implementation notes

Planner
- Model: gpt‑5
- Parameters: reasoning.effort=medium, text.verbosity=low
- Output contract: Strict JSON {"plan":[...]} (engine tolerates fallback formats via normalization)
- Optional tools: web_search_preview, file_search (vector_store_ids), remote MCP (via env toggles), constrained via allowed_tools

Executor
- Model: gpt‑5‑nano
- Parameters: reasoning.effort=minimal, text.verbosity=low
- Strict function-calling: emit_bash function required to guarantee a single-line bash command
- Post-guard: collapse whitespace, enforce single-line

Safety and isolation
- All commands are executed under the dedicated sandbox user via sudo -u
- Near-term hardening backlog:
  - Prefer argv-first exec (avoid shell) where possible
  - Allowlist/denylist and argument sanitizer
  - Optional chroot/bubblewrap/firejail
  - cgroup resource limits
  - network egress policy toggles per step
  - seccomp profiles

Troubleshooting
- Editor shows “Import could not be resolved” for fastapi/pydantic/openai/dotenv/socketio
  - Ensure your venv is active and requirements are installed
- OpenAI API errors
  - Verify OPENAI_API_KEY
  - Check model access and organization limits
- Socket.IO client cannot connect
  - Ensure you’re using socket.io-client on the UI; raw websockets are not wire-compatible
  - CORS is open by default in the current ASGI app
- Sandbox permission issues
  - Ensure the runtime service user can run sudo -u sandboxuser without interactive password for bash -c commands per your policy

Demo scenarios

Scenario 1: System diagnosis & CUDA install (outline)
- Agent introspects GPU (lspci, nvidia-smi)
- Chooses CUDA version
- Downloads and executes installer
- Shows live stdout/stderr and re-planning on failures

Scenario 2: Repo clone and failing tests with missing dependency (re-planning)
- Goal: "Clone the 'terminus' repo and run its tests."
- Deliberately missing pytest in requirements
- Observe pytest failure → error_detected in red → re_planning → pip install pytest → re-run tests → success

UI integration (high level)
- Use socket.io-client in the UI:
  - Emit execute_goal with the user's goal
  - Subscribe to events: plan_generated, step_executing, step_result, error_detected, re_planning, workflow_complete
- Render plan as a checklist, steps as cards, and color-code outputs:
  - Natural language step: blue text
  - Bash command: syntax-highlighted block on gray background
  - Stdout: green bordered console
  - Stderr: red bordered console
  - Status badges: PLANNING, EXECUTING, ERROR, RE-PLANNING, SUCCESS

References
- Plan and decisions: [plan.md](plan.md)
- Runtime entrypoint: [agent_core/main.py](agent_core/main.py)
- OpenAI wrappers: [agent_core/api_client.py](agent_core/api_client.py)
- Sandbox execution: [agent_core/sandbox.py](agent_core/sandbox.py)
- Event schemas: [agent_core/types.py](agent_core/types.py)
- Orchestrator: [agent_core/orchestrator.py](agent_core/orchestrator.py)
- Executor: [agent_core/executor.py](agent_core/executor.py)

License
- TBD
