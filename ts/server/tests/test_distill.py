"""Tree: format-transcript (Python).

Shared helper used by POST /distill and the capture-buffer flush. Each
turn is a list of canonical Messages (role ∈ {user, assistant, behaviour},
content: str). Behaviour messages are collapsed via the distill LLM into
a single first-person summary per turn; user + assistant text are passed
through around the summary.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from pipelines.distill import (
    DISTILL_SYSTEM_PROMPT,
    DistillResult,
    format_transcript,
    safe_distill,
)
from pipelines.messages import Message


def turn(*msgs: tuple[str, str]) -> list[Message]:
    return [Message(role=role, content=content) for role, content in msgs]


@pytest.fixture
def mock_llm_client():
    client = AsyncMock()
    client.generate_response = AsyncMock(return_value={"behaviour": "distilled summary"})
    return client


class TestFormatTranscript:
    async def test_distills_behaviour_into_summary(self, mock_llm_client):
        turns = [
            turn(
                ("user", "hi"),
                ("behaviour", "thought: greeting"),
                ("assistant", "hello"),
            )
        ]
        result = await format_transcript(turns, mock_llm_client, "TestAgent")
        assert "User: hi" in result
        assert "TestAgent: (behaviour: distilled summary)" in result
        assert "TestAgent: hello" in result

    async def test_passes_all_messages_to_distill_llm(self, mock_llm_client):
        turns = [
            turn(
                ("user", "q"),
                ("behaviour", "thought: considering"),
                ("behaviour", 'tool search(q="x") → found'),
                ("assistant", "a"),
            )
        ]
        await format_transcript(turns, mock_llm_client, "TestAgent")
        call = mock_llm_client.generate_response.await_args
        user_content = call.args[0][1].content
        assert "User: q" in user_content
        assert "TestAgent: thought: considering" in user_content
        assert 'TestAgent: tool search(q="x") → found' in user_content
        assert "TestAgent: a" in user_content

    async def test_orders_behaviour_before_assistant_text(self, mock_llm_client):
        turns = [
            turn(
                ("user", "q"),
                ("behaviour", "thought: x"),
                ("assistant", "a"),
            )
        ]
        result = await format_transcript(turns, mock_llm_client, "TestAgent")
        assert result.index("(behaviour:") < result.index("TestAgent: a")

    async def test_omits_behaviour_when_llm_client_is_none(self):
        turns = [
            turn(
                ("user", "hi"),
                ("behaviour", "secret"),
                ("assistant", "hello"),
            )
        ]
        result = await format_transcript(turns, None, "TestAgent")
        assert "(behaviour:" not in result
        assert "secret" not in result
        assert "User: hi" in result
        assert "TestAgent: hello" in result

    async def test_silently_drops_on_distill_failure(self, mock_llm_client):
        mock_llm_client.generate_response.side_effect = RuntimeError("boom")
        turns = [
            turn(
                ("user", "hi"),
                ("behaviour", "thought: x"),
                ("assistant", "hello"),
            )
        ]
        result = await format_transcript(turns, mock_llm_client, "TestAgent")
        assert "(behaviour:" not in result
        assert "User: hi" in result
        assert "TestAgent: hello" in result

    async def test_skips_turns_with_no_behaviour(self, mock_llm_client):
        turns = [turn(("user", "q"), ("assistant", "a"))]
        result = await format_transcript(turns, mock_llm_client, "TestAgent")
        assert result == "User: q\nTestAgent: a"
        mock_llm_client.generate_response.assert_not_awaited()

    async def test_distills_turns_in_parallel(self, mock_llm_client):
        mock_llm_client.generate_response = AsyncMock(
            side_effect=[{"behaviour": "first"}, {"behaviour": "second"}]
        )
        turns = [
            turn(("user", "q1"), ("behaviour", "thought: 1"), ("assistant", "a1")),
            turn(("user", "q2"), ("behaviour", "thought: 2"), ("assistant", "a2")),
        ]
        result = await format_transcript(turns, mock_llm_client, "TestAgent")
        assert "(behaviour: first)" in result
        assert "(behaviour: second)" in result
        assert mock_llm_client.generate_response.await_count == 2

    async def test_renders_user_only_when_no_behaviour_and_no_answer(self, mock_llm_client):
        turns = [turn(("user", "hello"))]
        result = await format_transcript(turns, mock_llm_client, "TestAgent")
        assert result == "User: hello"


class TestSafeDistill:
    async def test_returns_empty_when_thinking_is_empty(self, mock_llm_client):
        assert await safe_distill(mock_llm_client, "   ") == ""
        mock_llm_client.generate_response.assert_not_awaited()

    async def test_returns_distilled_text_on_success(self, mock_llm_client):
        assert await safe_distill(mock_llm_client, "did stuff") == "distilled summary"

    async def test_returns_empty_string_on_exception(self, mock_llm_client):
        mock_llm_client.generate_response.side_effect = RuntimeError("boom")
        assert await safe_distill(mock_llm_client, "did stuff") == ""

    async def test_uses_distill_response_model_and_system_prompt(self, mock_llm_client):
        await safe_distill(mock_llm_client, "did stuff")
        call = mock_llm_client.generate_response.await_args
        assert call.kwargs.get("response_model") is DistillResult
        assert call.kwargs.get("max_tokens") == 150
        prompt = call.args[0]
        assert prompt[0].role == "system"
        assert prompt[0].content == DISTILL_SYSTEM_PROMPT


class TestAgentNameValidation:
    async def test_blank_agent_name_raises(self, mock_llm_client):
        with pytest.raises(ValueError, match="agent_name"):
            await format_transcript([], mock_llm_client, "")

    async def test_whitespace_agent_name_raises(self, mock_llm_client):
        with pytest.raises(ValueError, match="agent_name"):
            await format_transcript([], mock_llm_client, "   ")

    async def test_none_agent_name_raises(self, mock_llm_client):
        with pytest.raises(ValueError, match="agent_name"):
            await format_transcript([], mock_llm_client, None)  # type: ignore[arg-type]
