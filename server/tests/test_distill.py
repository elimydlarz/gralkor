"""Tree: format-transcript (Python).

Shared helper used by POST /distill and the capture-buffer flush. Ports
src/distill.ts formatTranscript + safeDistill.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, call

import pytest

from pipelines.distill import (
    DISTILL_SYSTEM_PROMPT,
    DistillResult,
    EpisodeBlock,
    EpisodeMessage,
    Turn,
    TurnEvent,
    format_transcript,
    safe_distill,
    turns_to_episode_messages,
)


@pytest.fixture
def mock_llm_client():
    client = AsyncMock()
    client.generate_response = AsyncMock(return_value={"behaviour": "distilled summary"})
    return client


class TestTurnsToEpisodeMessages:
    def test_converts_user_query_to_user_message(self):
        turns = [Turn(user_query="hi", events=[], assistant_answer="hello")]
        messages = turns_to_episode_messages(turns)
        assert messages[0].role == "user"
        assert messages[0].content[0].text == "hi"

    def test_attaches_events_as_behaviour_blocks(self):
        turns = [
            Turn(
                user_query="search memory",
                events=[
                    TurnEvent(kind="thinking", text="let me think"),
                    TurnEvent(kind="tool_use", text="memory_search(q)"),
                    TurnEvent(kind="tool_result", text="Facts: - fact"),
                ],
                assistant_answer="here is the answer",
            )
        ]
        messages = turns_to_episode_messages(turns)
        assistant = messages[1]
        assert assistant.role == "assistant"
        assert [b.type for b in assistant.content] == ["thinking", "tool_use", "tool_result", "text"]
        assert assistant.content[-1].text == "here is the answer"

    def test_text_only_turn_produces_text_block_only(self):
        turns = [Turn(user_query="hi", events=[], assistant_answer="hello")]
        messages = turns_to_episode_messages(turns)
        assistant = messages[1]
        assert len(assistant.content) == 1
        assert assistant.content[0].type == "text"

    def test_empty_user_query_skips_user_message(self):
        turns = [
            Turn(
                user_query="",
                events=[TurnEvent(kind="thinking", text="t")],
                assistant_answer="a",
            )
        ]
        messages = turns_to_episode_messages(turns)
        assert [m.role for m in messages] == ["assistant"]


class TestFormatTranscript:
    async def test_distills_behaviour_blocks_into_summary(self, mock_llm_client):
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="hi")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="thinking", text="let me think"),
                    EpisodeBlock(type="text", text="hello"),
                ],
            ),
        ]
        result = await format_transcript(messages, mock_llm_client)
        assert "User: hi" in result
        assert "Assistant: (behaviour: distilled summary)" in result
        assert "Assistant: hello" in result

    async def test_orders_behaviour_before_assistant_text(self, mock_llm_client):
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="q")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="tool_use", text="tool call"),
                    EpisodeBlock(type="text", text="a"),
                ],
            ),
        ]
        result = await format_transcript(messages, mock_llm_client)
        behaviour_pos = result.index("(behaviour:")
        text_pos = result.index("Assistant: a")
        assert behaviour_pos < text_pos

    async def test_omits_behaviour_when_llm_client_is_none(self):
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="hi")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="thinking", text="secret thought"),
                    EpisodeBlock(type="text", text="hello"),
                ],
            ),
        ]
        result = await format_transcript(messages, None)
        assert "(behaviour:" not in result
        assert "secret thought" not in result
        assert "Assistant: hello" in result
        assert "User: hi" in result

    async def test_silently_drops_on_distill_failure(self, mock_llm_client):
        mock_llm_client.generate_response.side_effect = RuntimeError("boom")
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="hi")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="thinking", text="thought"),
                    EpisodeBlock(type="text", text="hello"),
                ],
            ),
        ]
        result = await format_transcript(messages, mock_llm_client)
        assert "(behaviour:" not in result
        assert "User: hi" in result
        assert "Assistant: hello" in result

    async def test_skips_turns_with_only_text(self, mock_llm_client):
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="q")]),
            EpisodeMessage(role="assistant", content=[EpisodeBlock(type="text", text="a")]),
        ]
        result = await format_transcript(messages, mock_llm_client)
        assert result == "User: q\nAssistant: a"
        mock_llm_client.generate_response.assert_not_awaited()

    async def test_distills_turns_in_parallel(self, mock_llm_client):
        mock_llm_client.generate_response = AsyncMock(
            side_effect=[
                {"behaviour": "first"},
                {"behaviour": "second"},
            ]
        )
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="q1")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="thinking", text="t1"),
                    EpisodeBlock(type="text", text="a1"),
                ],
            ),
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="q2")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="tool_use", text="u2"),
                    EpisodeBlock(type="text", text="a2"),
                ],
            ),
        ]
        result = await format_transcript(messages, mock_llm_client)
        assert "(behaviour: first)" in result
        assert "(behaviour: second)" in result
        assert mock_llm_client.generate_response.await_count == 2

    async def test_includes_response_grounding_in_distill_input(self, mock_llm_client):
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="what to eat")]),
            EpisodeMessage(
                role="assistant",
                content=[
                    EpisodeBlock(type="thinking", text="hungry"),
                    EpisodeBlock(type="text", text="try pizza"),
                ],
            ),
        ]
        await format_transcript(messages, mock_llm_client)
        call_args = mock_llm_client.generate_response.await_args
        prompt_messages = call_args.args[0]
        user_content = prompt_messages[1].content
        assert "User: what to eat" in user_content
        assert "Actions:" in user_content
        assert "hungry" in user_content
        assert "Response: try pizza" in user_content

    async def test_renders_user_only_when_no_behaviour(self, mock_llm_client):
        messages = [
            EpisodeMessage(role="user", content=[EpisodeBlock(type="text", text="hello")]),
        ]
        result = await format_transcript(messages, mock_llm_client)
        assert result == "User: hello"


class TestSafeDistill:
    async def test_returns_empty_when_thinking_is_empty(self, mock_llm_client):
        assert await safe_distill(mock_llm_client, "   ") == ""
        mock_llm_client.generate_response.assert_not_awaited()

    async def test_returns_distilled_text_on_success(self, mock_llm_client):
        result = await safe_distill(mock_llm_client, "did stuff")
        assert result == "distilled summary"

    async def test_returns_empty_string_on_exception(self, mock_llm_client):
        mock_llm_client.generate_response.side_effect = RuntimeError("boom")
        result = await safe_distill(mock_llm_client, "did stuff")
        assert result == ""

    async def test_uses_distill_response_model(self, mock_llm_client):
        await safe_distill(mock_llm_client, "did stuff")
        call_args = mock_llm_client.generate_response.await_args
        assert call_args.kwargs.get("response_model") is DistillResult
        assert call_args.kwargs.get("max_tokens") == 150
        prompt_messages = call_args.args[0]
        assert prompt_messages[0].role == "system"
        assert prompt_messages[0].content == DISTILL_SYSTEM_PROMPT
