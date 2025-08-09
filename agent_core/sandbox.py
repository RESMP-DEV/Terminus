import os
import re
import shlex
import subprocess
from typing import Dict, List, Tuple


def _env_flag(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).strip().lower() in ("1", "true", "yes", "on")


def _split_allowlist(value: str) -> List[str]:
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


def execute_command(command: str) -> Dict[str, object]:
    """
    sandbox.execute_command()

    Execute a single-line command as a low-privilege sandbox user.

    Behavior:
      - Enforces minimal sanitation against multi-line input and control chars.
      - Honors optional allowlist via SANDBOX_CMD_ALLOWLIST (comma-separated).
      - Uses sudo -u <SANDBOX_USER> bash -lc "<command>".

    Environment variables:
      - SANDBOX_USER (default: 'sandboxuser')
      - SANDBOX_STRICT_SANITIZE (default: true)
      - SANDBOX_CMD_ALLOWLIST (comma-separated first-argv allowlist; default empty)
      - MAX_COMMAND_LEN (default: 2000)
    """
    ok, err = _sanitize_command(command)
    if not ok:
        return {"stdout": "", "stderr": f"Rejected: {err}", "exit_code": -2}

    user = os.getenv("SANDBOX_USER", "sandboxuser").strip() or "sandboxuser"

    try:
        # Use bash -lc to allow PATH/rc resolution but keep single-line guard.
        # Note: We rely on the sanitizer for single-line restriction.
        result = subprocess.run(
            ["sudo", "-u", user, "bash", "-lc", command],
            capture_output=True,
            text=True,
            check=False,
        )
        return {"stdout": result.stdout, "stderr": result.stderr, "exit_code": result.returncode}
    except FileNotFoundError:
        return {
            "stdout": "",
            "stderr": "The 'sudo' command is not available in the current environment.",
            "exit_code": -1,
        }
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "exit_code": -1}