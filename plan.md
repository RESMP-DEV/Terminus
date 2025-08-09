# Detailed Plan: State & Feedback Loop Developer

This plan outlines the detailed steps for building the Engine, which is responsible for managing the workflow, executing commands, and communicating state changes.

## Phase 1: Sandbox and Execution Environment

### 1. Create `setup_sandbox.sh`
*   **Objective:** Create a script to provision the isolated sandbox environment.
*   **Details:**
    *   Create a new system user `sandboxuser`.
    *   Set up a home directory for `sandboxuser`.
    *   Install essential packages: `git`, `python3`, `pip`, `curl`, `wget`, `build-essential`.
    *   Configure permissions to restrict `sandboxuser`'s access to the rest of the system.

### 2. Develop `agent_core/sandbox.py`
*   **Objective:** Create a secure command execution module.
*   **Details:**
    *   Implement the `execute_command(command: str) -> dict` function.
    *   Use `subprocess.run()` to execute commands.
    *   Execute all commands as `sandboxuser` using `sudo -u sandboxuser`.
    *   Capture and return `stdout`, `stderr`, and `exit_code`.
    *   Implement robust error handling and sanitization to prevent command injection.

## Phase 2: Core Runtime and API Integration

### 3. Develop `agent_core/api_client.py`
*   **Objective:** Centralize all interactions with the GPT-5 API.
*   **Details:**
    *   Implement functions to call the `gpt-5-thinking` and `gpt-5-thinking-nano` models.
    *   Manage API keys securely, loading them from a `.env` file.
    *   Include the `safety_identifier` in every API call.
    *   Implement error handling for API requests.

### 4. Implement the Orchestrator (`agent_core/orchestrator.py`)
*   **Objective:** Build the module for AI-driven planning.
*   **Details:**
    *   Implement `create_initial_plan(user_goal: str) -> list[str]`.
    *   Implement `create_revised_plan(history: list, error: str) -> list[str]`.
    *   Integrate with `api_client.py` to make calls to the GPT-5 API.

### 5. Implement the Executor (`agent_core/executor.py`)
*   **Objective:** Build the module for translating tasks into commands.
*   **Details:**
    *   Implement `translate_task_to_bash(sub_task: str) -> str`.
    *   Integrate with `api_client.py` to make calls to the `gpt-5-thinking-nano` model.

## Phase 3: Main Application and WebSocket Communication

### 6. Implement `agent_core/main.py`
*   **Objective:** Create the main application logic and WebSocket endpoint.
*   **Details:**
    *   Initialize a FastAPI application.
    *   Create a WebSocket endpoint at `/ws`.
    *   Implement the main workflow loop to handle the `execute_goal` message.
    *   Integrate with the Orchestrator, Executor, and Sandbox Manager.
    *   Manage the state of the workflow and send updates to the UI.

### 7. Adhere to API Contract
*   **Objective:** Ensure all WebSocket messages are correctly formatted.
*   **Details:**
    *   Implement functions to create and send all message types defined in the API contract.
    *   Validate the structure of incoming and outgoing messages.

## Workflow Visualization

```mermaid
graph TD
    A[UI: User enters goal] -->|{"type": "execute_goal"}| B(main.py: WebSocket Server);
    B --> C{Orchestrator: create_initial_plan};
    C -->|plan| B;
    B -->|{"type": "plan_generated"}| A;
    B --> D{Executor: translate_task_to_bash};
    D -->|bash command| B;
    B -->|{"type": "step_executing"}| A;
    B --> E{Sandbox: execute_command};
    E -->|{stdout, stderr, exit_code}| B;
    B -->|{"type": "step_result"}| A;
    subgraph Error Handling
        E -->|exit_code != 0| F{Orchestrator: create_revised_plan};
        F -->|new plan| B;
        B -->|{"type": "re_planning"}| A;
    end
    B -->|Loop until complete| D;
    B -->|{"type": "workflow_complete"}| A;