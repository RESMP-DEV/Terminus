import pytest
from httpx import Response

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


def test_executor_calls_local_api(httpx_mock):
    # Arrange
    expected_command = "ls -l"
    httpx_mock.add_response(
        url=api_client.EXECUTOR_API_URL,
        method="POST",
        json={"command": expected_command},
        status_code=200,
    )

    # Act
    command = api_client.run_executor(sub_task="list files", session_id="sess123")

    # Assert
    assert command == expected_command
    request = httpx_mock.get_request()
    assert request.url == api_client.EXECUTOR_API_URL
    assert request.method == "POST"
    
    import json
    assert json.loads(request.read().decode()) == {"prompt": "list files", "max_new_tokens": 256}
