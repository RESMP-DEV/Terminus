import os
import re
import shlex
import shutil
import asyncio
import subprocess
from typing import Dict, List, Tuple


def _env_flag(name: str, default: str = "false") -> bool:
    """Read a truthy boolean env flag with permissive values.

    Accepts common true-ish values: 1/true/yes/on (case-insensitive).
    """
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _split_allowlist(value: str) -> List[str]:
    """Split a comma-separated allowlist string into normalized tokens."""
    if not value:
        return []
    return [x.strip() for x in value.split(",") if x.strip()]


def _sanitize_command(cmd: str) -> Tuple[bool, str]:
    """
    Basic sanitizer to reduce injection risk while allowing useful commands.
    Policy:
      - Enforce single-line (no newlines, carriage returns, NULs).
      - Enforce max length.
      - Optional strict control-char rejection.
      - Optional allowlist on first argv token.
    Returns (ok, error_message)
    """
    max_len = int(os.getenv("MAX_COMMAND_LEN", "2000"))
    if not isinstance(cmd, str) or not cmd.strip():
        return False, "Empty command"
    if len(cmd) > max_len:
        return False, f"Command exceeds maximum length of {max_len} characters"

    # Disallow newlines and NUL
    if any(ch in cmd for ch in ("\n", "\r", "\x00")):
        return False, "Command contains disallowed newline or NUL characters"

    # Optional strict control-char rejection
    if _env_flag("SANDBOX_STRICT_SANITIZE", "true"):
        # Reject ASCII control chars excluding horizontal tab (allow tabs)
        if re.search(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", cmd):
            return False, "Command contains disallowed control characters"

    # Optional allowlist: match first argv token using shell-like splitting
    allow = _split_allowlist(os.getenv("SANDBOX_CMD_ALLOWLIST", ""))
    if allow:
        try:
            first = shlex.split(cmd)[0]
        except Exception:
            return False, "Unable to parse command for allowlist check"
        if first not in allow:
            return False, f"Command '{first}' not permitted by allowlist"

    return True, ""

async def _execute_command_unmanaged_async(command: str) -> Dict[str, object]:
    """
    Private: Execute a command without virtualenv activation, asynchronously.
    """
    ok, err = _sanitize_command(command)
    if not ok:
        return {"stdout": "", "stderr": f"Rejected: {err}", "exit_code": -2}

    user = "root"
    force_local = _env_flag("SANDBOX_FORCE_LOCAL", "false")

    async def _run_local_async() -> Dict[str, object]:
        try:
            proc = await asyncio.create_subprocess_shell(
                command,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            stdout, stderr = await proc.communicate()
            return {
                "stdout": stdout.decode(),
                "stderr": stderr.decode(),
                "exit_code": proc.returncode,
            }
        except Exception as e:
            return {"stdout": "", "stderr": str(e), "exit_code": -1}

    # Prefer sudo sandbox unless forced local or prerequisites missing
    if not force_local:
        sudo_path = shutil.which("sudo")
        if sudo_path:
            try:
                proc = await asyncio.create_subprocess_exec(
                    sudo_path,
                    "-u",
                    user,
                    "bash",
                    "-lc",
                    command,
                    stdout=asyncio.subprocess.PIPE,
                    stderr=asyncio.subprocess.PIPE,
                )
                stdout, stderr = await proc.communicate()
                return {
                    "stdout": stdout.decode(),
                    "stderr": stderr.decode(),
                    "exit_code": proc.returncode,
                }
            except Exception:
                return await _run_local_async()
        else:
            return await _run_local_async()

    return await _run_local_async()


def _execute_command_unmanaged(command: str) -> Dict[str, object]:
    """
    Synchronous wrapper for the async unmanaged command execution.
    """
    return asyncio.run(_execute_command_unmanaged_async(command))


async def execute_command_async(command: str) -> Dict[str, object]:
    """
    Execute a command asynchronously within the project's .venv_demo virtual environment.
    """
    venv_activate_path = os.path.join(os.getcwd(), ".venv_demo", "bin", "activate")
    wrapped_command = f"source '{venv_activate_path}' && {command}"
    return await _execute_command_unmanaged_async(wrapped_command)


def execute_command(command: str) -> Dict[str, object]:
    """
    Execute a command synchronously within the project's .venv_demo virtual environment.
    """
    return asyncio.run(execute_command_async(command))
    return _execute_command_unmanaged(wrapped_command)
