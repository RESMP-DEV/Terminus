import types
import os

import pytest

# System under test
from agent_core import api_client


class DummyResponse:
    def __init__(self, output_text=None, output=None):
        self.output_text = output_text
        self.output = output or []


class DummyOpenAIClient:
    class Responses:
        def __init__(self, create_impl):
            self._create_impl = create_impl

        def create(self, **kwargs):
            return self._create_impl(**kwargs)

    def __init__(self, create_impl):
        self.responses = DummyOpenAIClient.Responses(create_impl)


@pytest.fixture(autouse=True)
def ensure_env(monkeypatch):
    # Make sure the key exists so client construction doesn't fail
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    yield


def test_planner_parses_json_plan(monkeypatch):
    # Arrange: stub responses.create to return a JSON plan payload as text
    def create_impl(**kwargs):
        return DummyResponse(output_text='{"plan": ["step one", "step two"]}')

    monkeypatch.setattr(api_client, "client", DummyOpenAIClient(create_impl))

    # Act
    steps = api_client.run_planner(user_goal="Do something", session_id="sess123")

    # Assert
    assert steps == ["step one", "step two"]


def test_planner_parses_plain_text_bullets(monkeypatch):
    # Arrange
    plain = "- step A\n- step B\n- step C\n"
    def create_impl(**kwargs):
        return DummyResponse(output_text=plain)

    monkeypatch.setattr(api_client, "client", DummyOpenAIClient(create_impl))

    # Act
    steps = api_client.run_planner(user_goal="Do something", session_id="sess123")

    # Assert
    assert steps == ["step A", "step B", "step C"]


def test_executor_strict_function_fallback_to_text(monkeypatch):
    # Arrange: strict mode requires a function call; we can still fall back to text
    def create_impl(**kwargs):
        # Simulate a response that doesn't include a function call item,
        # forcing the fallback to output_text extraction.
        return DummyResponse(output_text="echo hello")

    monkeypatch.setattr(api_client, "client", DummyOpenAIClient(create_impl))
    monkeypatch.setenv("EXECUTOR_STRICT_FUNCTION", "true")

    # Act
    cmd = api_client.run_executor(sub_task="Say hello", session_id="sess123", strict_mode=True)

    # Assert
    assert cmd == "echo hello"


def test_executor_minimal_reasoning_text_mode(monkeypatch):
    # Arrange: non-strict mode uses plain text extraction path
    def create_impl(**kwargs):
        return DummyResponse(output_text="printf test")

    monkeypatch.setattr(api_client, "client", DummyOpenAIClient(create_impl))

    # Act
    cmd = api_client.run_executor(sub_task="Print", session_id="sess123", strict_mode=False)

    # Assert
    assert cmd == "printf test"