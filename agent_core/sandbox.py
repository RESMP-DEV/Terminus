import subprocess

def execute_command(command: str) -> dict:
    """
    Executes a command in a sandboxed environment.

    Args:
        command: The command to execute.

    Returns:
        A dictionary containing the stdout, stderr, and exit code.
    """
    try:
        result = subprocess.run(
            ['sudo', '-u', 'sandboxuser', 'bash', '-c', command],
            capture_output=True,
            text=True,
            check=False
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.returncode
        }
    except FileNotFoundError:
        return {
            "stdout": "",
            "stderr": "The 'sudo' command is not available in the current environment.",
            "exit_code": -1
        }
    except Exception as e:
        return {
            "stdout": "",
            "stderr": str(e),
            "exit_code": -1
        }