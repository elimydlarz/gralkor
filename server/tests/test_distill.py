"""Tree: format-transcript (Python).

Shared helper used by POST /distill and the capture-buffer flush. Ports
src/distill.ts formatTranscript + safeDistill. Events are loose dicts
(anything the consumer has); the renderer JSON-serialises them into the
distill prompt.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from pipelines.distill import (
    DISTILL_SYSTEM_PROMPT,
    DistillResult,
    Turn,
    format_transcript,
    safe_distill,
)


@pytest.fixture
def mock_llm_client():
    client = AsyncMock()
    client.generate_response = AsyncMock(return_value={"behaviour": "distilled summary"})
    return client


class TestFormatTranscript:
    async def test_distills_events_into_summary(self, mock_llm_client):
        turns = [
            Turn(
                user_query="hi",
                events=[{"kind": "llm_completed", "content": "let me think"}],
                assistant_answer="hello",
            )
        ]
        result = await format_transcript(turns, mock_llm_client)
        assert "User: hi" in result
        assert "Assistant: (behaviour: distilled summary)" in result
        assert "Assistant: hello" in result

    async def test_accepts_arbitrary_event_shapes(self, mock_llm_client):
        turns = [
            Turn(
                user_query="q",
                events=[
                    {"kind": "llm_completed", "content": [{"type": "text", "text": "thinking"}]},
                    {"kind": "tool_started", "tool": "search", "args": {"q": "x"}},
                    {"kind": "tool_completed", "tool": "search", "result": "found"},
                    "a loose string event",
                ],
                assistant_answer="a",
            )
        ]
        await format_transcript(turns, mock_llm_client)
        call = mock_llm_client.generate_response.await_args
        user_content = call.args[0][1].content
        assert "llm_completed" in user_content
        assert "tool_started" in user_content
        assert "tool_completed" in user_content
        assert "a loose string event" in user_content

    async def test_orders_behaviour_before_assistant_text(self, mock_llm_client):
        turns = [
            Turn(
                user_query="q",
                events=[{"kind": "tool_started", "tool": "x"}],
                assistant_answer="a",
            )
        ]
        result = await format_transcript(turns, mock_llm_client)
        assert result.index("(behaviour:") < result.index("Assistant: a")

    async def test_omits_behaviour_when_llm_client_is_none(self):
        turns = [
            Turn(
                user_query="hi",
                events=[{"kind": "llm_completed", "content": "secret"}],
                assistant_answer="hello",
            )
        ]
        result = await format_transcript(turns, None)
        assert "(behaviour:" not in result
        assert "secret" not in result
        assert "User: hi" in result
        assert "Assistant: hello" in result

    async def test_silently_drops_on_distill_failure(self, mock_llm_client):
        mock_llm_client.generate_response.side_effect = RuntimeError("boom")
        turns = [Turn(user_query="hi", events=[{"e": 1}], assistant_answer="hello")]
        result = await format_transcript(turns, mock_llm_client)
        assert "(behaviour:" not in result
        assert "User: hi" in result
        assert "Assistant: hello" in result

    async def test_skips_turns_with_no_events(self, mock_llm_client):
        turns = [Turn(user_query="q", events=[], assistant_answer="a")]
        result = await format_transcript(turns, mock_llm_client)
        assert result == "User: q\nAssistant: a"
        mock_llm_client.generate_response.assert_not_awaited()

    async def test_distills_turns_in_parallel(self, mock_llm_client):
        mock_llm_client.generate_response = AsyncMock(
            side_effect=[{"behaviour": "first"}, {"behaviour": "second"}]
        )
        turns = [
            Turn(user_query="q1", events=[{"x": 1}], assistant_answer="a1"),
            Turn(user_query="q2", events=[{"x": 2}], assistant_answer="a2"),
        ]
        result = await format_transcript(turns, mock_llm_client)
        assert "(behaviour: first)" in result
        assert "(behaviour: second)" in result
        assert mock_llm_client.generate_response.await_count == 2

    async def test_includes_user_and_response_grounding(self, mock_llm_client):
        turns = [
            Turn(
                user_query="what to eat",
                events=[{"kind": "llm_completed", "content": "hungry"}],
                assistant_answer="try pizza",
            )
        ]
        await format_transcript(turns, mock_llm_client)
        call = mock_llm_client.generate_response.await_args
        user_content = call.args[0][1].content
        assert "User: what to eat" in user_content
        assert "Actions:" in user_content
        assert "hungry" in user_content
        assert "Response: try pizza" in user_content

    async def test_renders_user_only_when_no_events(self, mock_llm_client):
        turns = [Turn(user_query="hello", events=[], assistant_answer="")]
        result = await format_transcript(turns, mock_llm_client)
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
