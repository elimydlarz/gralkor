"""Unit tests for _format_transcript (transcript formatting + thinking distillation)."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from main import _format_transcript, ConversationMessage, ContentBlock


def _msg(role: str, blocks: list[tuple[str, str]]) -> ConversationMessage:
    return ConversationMessage(role=role, content=[ContentBlock(type=t, text=txt) for t, txt in blocks])


@pytest.mark.asyncio
async def test_formats_simple_transcript():
    msgs = [
        _msg("user", [("text", "Fix the bug")]),
        _msg("assistant", [("text", "Fixed it!")]),
    ]
    result = await _format_transcript(msgs, None)
    assert result == "User: Fix the bug\nAssistant: Fixed it!"


@pytest.mark.asyncio
async def test_multi_turn():
    msgs = [
        _msg("user", [("text", "First")]),
        _msg("assistant", [("text", "A1")]),
        _msg("user", [("text", "Second")]),
        _msg("assistant", [("text", "A2")]),
    ]
    result = await _format_transcript(msgs, None)
    assert result == "User: First\nAssistant: A1\nUser: Second\nAssistant: A2"


@pytest.mark.asyncio
async def test_distills_thinking_into_action():
    llm = AsyncMock()
    llm.generate_response = AsyncMock(return_value={"content": "Resolved the null pointer"})

    msgs = [
        _msg("user", [("text", "Fix the bug")]),
        _msg("assistant", [("thinking", "Let me search..."), ("text", "Fixed it!")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert result == (
        "User: Fix the bug\n"
        "Assistant: (behaviour: Resolved the null pointer)\n"
        "Assistant: Fixed it!"
    )


@pytest.mark.asyncio
async def test_no_thinking_skips_distillation():
    llm = AsyncMock()
    msgs = [
        _msg("user", [("text", "Hello")]),
        _msg("assistant", [("text", "Hi")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert result == "User: Hello\nAssistant: Hi"
    llm.generate_response.assert_not_called()


@pytest.mark.asyncio
async def test_distillation_failure_drops_action():
    llm = AsyncMock()
    llm.generate_response = AsyncMock(side_effect=RuntimeError("LLM down"))

    msgs = [
        _msg("user", [("text", "Fix it")]),
        _msg("assistant", [("thinking", "thinking..."), ("text", "Done")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert result == "User: Fix it\nAssistant: Done"
    assert "(behaviour:" not in result


@pytest.mark.asyncio
async def test_no_llm_client_skips_thinking():
    msgs = [
        _msg("user", [("text", "Fix it")]),
        _msg("assistant", [("thinking", "thinking..."), ("text", "Done")]),
    ]
    result = await _format_transcript(msgs, None)
    assert result == "User: Fix it\nAssistant: Done"


@pytest.mark.asyncio
async def test_multi_turn_distillation():
    call_count = 0

    async def mock_generate(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        return {"content": f"Action {call_count}"}

    llm = AsyncMock()
    llm.generate_response = mock_generate

    msgs = [
        _msg("user", [("text", "Q1")]),
        _msg("assistant", [("thinking", "T1"), ("text", "A1")]),
        _msg("user", [("text", "Q2")]),
        _msg("assistant", [("thinking", "T2"), ("text", "A2")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert "Assistant: (behaviour: Action 1)" in result
    assert "Assistant: (behaviour: Action 2)" in result


@pytest.mark.asyncio
async def test_multiple_assistant_messages_per_turn():
    llm = AsyncMock()
    llm.generate_response = AsyncMock(return_value={"content": "Did the thing"})

    msgs = [
        _msg("user", [("text", "Do something")]),
        _msg("assistant", [("thinking", "First thought")]),
        _msg("assistant", [("thinking", "Second thought"), ("text", "Done")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert result == (
        "User: Do something\n"
        "Assistant: (behaviour: Did the thing)\n"
        "Assistant: Done"
    )


@pytest.mark.asyncio
async def test_empty_messages():
    result = await _format_transcript([], None)
    assert result == ""


@pytest.mark.asyncio
async def test_assistant_before_any_user():
    """Assistant message before first user message — no turn index, no action."""
    llm = AsyncMock()
    llm.generate_response = AsyncMock(return_value={"content": "Did something"})

    msgs = [
        _msg("assistant", [("thinking", "Startup thinking"), ("text", "Hello, I'm ready")]),
        _msg("user", [("text", "Great")]),
        _msg("assistant", [("text", "How can I help?")]),
    ]
    result = await _format_transcript(msgs, llm)
    # Pre-user assistant text should appear, thinking distilled for that "turn"
    assert "Assistant: Hello, I'm ready" in result
    assert "User: Great" in result
    assert "Assistant: How can I help?" in result


@pytest.mark.asyncio
async def test_thinking_only_no_text():
    """Assistant message with only thinking blocks and no text."""
    llm = AsyncMock()
    llm.generate_response = AsyncMock(return_value={"content": "Investigated the issue"})

    msgs = [
        _msg("user", [("text", "Fix the bug")]),
        _msg("assistant", [("thinking", "I need to investigate")]),
        _msg("assistant", [("text", "Found and fixed it")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert "Assistant: (behaviour: Investigated the issue)" in result
    assert "Assistant: Found and fixed it" in result


@pytest.mark.asyncio
async def test_whitespace_only_thinking_skipped():
    """Whitespace-only thinking should not trigger distillation."""
    llm = AsyncMock()
    llm.generate_response = AsyncMock(return_value={"content": "Should not appear"})

    msgs = [
        _msg("user", [("text", "Hello")]),
        _msg("assistant", [("thinking", "   \n  "), ("text", "Hi")]),
    ]
    result = await _format_transcript(msgs, llm)
    assert "(behaviour:" not in result
    llm.generate_response.assert_not_called()
