import json
from typing import Any, Dict, List, Optional

from agent_core import api_client


def create_initial_plan(
    user_goal: str, session_id: str, enable_search: Optional[bool] = None
) -> List[str]:
    """
    Orchestrator.create_initial_plan()

    Generates an initial step-by-step plan for the provided user goal.

    - Delegates to api_client.run_planner() using GPT-5 with:
      reasoning.effort=medium, text.verbosity=low, optional tools via env toggles
    - Returns a list of short, imperative steps.
    """
    steps = api_client.run_planner(
        user_goal=user_goal,
        session_id=session_id,
        enable_search=enable_search,
        vector_store_ids=None,
        mcp_servers=None,
        previous_response_id=None,
    )
    return steps


def create_revised_plan(
    session_id: str,
    history: List[Dict[str, Any]],
    failed_step: str,
    error: str,
    original_goal: Optional[str] = None,
) -> List[str]:
    """
    Orchestrator.create_revised_plan()

    Produces a revised plan accounting for prior execution history and an error.

    - Serializes relevant context and prompts the planner again.
    - Returns a list of short, imperative steps.
    """
    context = {
        "original_goal": original_goal or "",
        "failed_step": failed_step,
        "error": error,
        "history": history,
    }
    revised_prompt = (
        "Re-plan to complete the objective after encountering an error.\n"
        "Constraints:\n"
        "- Keep steps minimal and imperative\n"
        "- Include any necessary remediation or prerequisites discovered from the error\n"
        "- Avoid repeating already successful steps unless needed as prerequisites\n\n"
        f"Context JSON:\n{json.dumps(context)[:6000]}"
    )

    steps = api_client.run_planner(
        user_goal=revised_prompt,
        session_id=session_id,
        enable_search=None,
        vector_store_ids=None,
        mcp_servers=None,
        previous_response_id=None,
    )
    return steps
