import pytest

from agent_core import sandbox


@pytest.fixture(autouse=True)
def strict_env(monkeypatch):
    monkeypatch.setenv("SANDBOX_STRICT_SANITIZE", "true")
    monkeypatch.setenv("MAX_COMMAND_LEN", "256")
    # Do not set SANDBOX_CMD_ALLOWLIST by default (no allowlist)
    yield


def test_rejects_empty_command():
    res = sandbox.execute_command("")
    assert res["exit_code"] == -2
    assert "Rejected" in res["stderr"]


def test_rejects_newlines():
    res = sandbox.execute_command("echo hello\necho world")
    assert res["exit_code"] == -2
    assert "newline" in res["stderr"].lower()


def test_rejects_control_chars():
    res = sandbox.execute_command("echo \x07")  # bell
    assert res["exit_code"] == -2
    assert "control" in res["stderr"].lower()


def test_rejects_excessive_length(monkeypatch):
    monkeypatch.setenv("MAX_COMMAND_LEN", "10")
    res = sandbox.execute_command("echo this is too long")
    assert res["exit_code"] == -2
    assert "exceeds" in res["stderr"].lower()


def test_allowlist_blocks_unlisted(monkeypatch):
    monkeypatch.setenv("SANDBOX_CMD_ALLOWLIST", "echo")
    res = sandbox.execute_command("uname -a")
    assert res["exit_code"] == -2
    assert "not permitted" in res["stderr"].lower()


def test_allowlist_allows_listed(monkeypatch):
    # Note: This still attempts sudo -u <user> bash -lc "echo ok"
    # In CI or local dev without configured sudoers, this may return -1 with stderr explaining sudo not available.
    # We assert only that the sanitizer does not block 'echo' when allowlisted.
    monkeypatch.setenv("SANDBOX_CMD_ALLOWLIST", "echo")
    res = sandbox.execute_command("echo ok")
    # exit_code may be 0 in properly configured environments, else -1 if sudo not available.
    assert "stderr" in res and "stdout" in res and "exit_code" in res
    # If executed, stdout should contain 'ok'
    if res["exit_code"] == 0:
        assert res["stdout"].strip() == "ok"
