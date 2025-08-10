import uuid

from agent_core import api_client


def _ephemeral_session_id() -> str:
    # Generate a short, unique session id for safety_identifier when none is provided.
    return uuid.uuid4().hex[:12]


def translate_task_to_bash(sub_task: str) -> str:
    """
    executor.translate_task_to_bash()

    Translate a natural-language sub-task into a single-line executable Bash command.

    Notes:
    - This wrapper adheres to the specified signature (no session_id param).
    - For safety_identifier tagging, we generate an ephemeral session id here.
      When available, prefer calling api_client.run_executor directly with a
      stable session id from the runtime to correlate logs and safety metadata.
    """
    session_id = _ephemeral_session_id()
    return api_client.run_executor(
        sub_task=sub_task,
        session_id=session_id,
        strict_mode=True,
    )


__all__ = ["translate_task_to_bash"]
