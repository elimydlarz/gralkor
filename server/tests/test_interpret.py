"""Tree: interpret-facts (Python).

Shared helper used by /recall and /tools/memory_search. Consumes a flat
list of canonical Messages (role labels are applied inside
build_interpretation_context). Fails fast when LLM is absent or empty.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from pipelines.interpret import (
    INTERPRET_CHAR_BUDGET,
    INTERPRET_SYSTEM_PROMPT,
    InterpretResult,
    build_interpretation_context,
    interpret_facts,
)
from pipelines.messages import Message


@pytest.fixture
def mock_llm_client():
    client = AsyncMock()
    client.generate_response = AsyncMock(return_value={"text": "relevant interpretation"})
    return client


class TestInterpretFacts:
    async def test_raises_when_llm_client_is_none(self):
        with pytest.raises(RuntimeError, match="llm_client is required"):
            await interpret_facts(
                [Message(role="user", content="hi")],
                "- fact 1",
                None,
            )

    async def test_raises_when_llm_returns_empty_text(self, mock_llm_client):
        mock_llm_client.generate_response.return_value = {"text": ""}
        with pytest.raises(RuntimeError, match="empty interpretation"):
            await interpret_facts(
                [Message(role="user", content="hi")],
                "- fact 1",
                mock_llm_client,
            )

    async def test_raises_when_llm_returns_whitespace_only(self, mock_llm_client):
        mock_llm_client.generate_response.return_value = {"text": "   \n  "}
        with pytest.raises(RuntimeError, match="empty interpretation"):
            await interpret_facts(
                [Message(role="user", content="hi")],
                "- fact 1",
                mock_llm_client,
            )

    async def test_returns_stripped_text_on_success(self, mock_llm_client):
        mock_llm_client.generate_response.return_value = {"text": "  the answer  "}
        result = await interpret_facts(
            [Message(role="user", content="hi")],
            "- fact 1",
            mock_llm_client,
        )
        assert result == "the answer"

    async def test_passes_system_prompt_and_context(self, mock_llm_client):
        await interpret_facts(
            [Message(role="user", content="what's up")],
            "- lucky number 47",
            mock_llm_client,
        )
        call = mock_llm_client.generate_response.await_args
        messages = call.args[0]
        assert messages[0].role == "system"
        assert messages[0].content == INTERPRET_SYSTEM_PROMPT
        assert messages[1].role == "user"
        assert "Conversation context:" in messages[1].content
        assert "User: what's up" in messages[1].content
        assert "lucky number 47" in messages[1].content

    async def test_uses_response_model(self, mock_llm_client):
        await interpret_facts(
            [Message(role="user", content="q")],
            "- fact",
            mock_llm_client,
        )
        call = mock_llm_client.generate_response.await_args
        assert call.kwargs.get("response_model") is InterpretResult
        assert call.kwargs.get("max_tokens") == 500


class TestBuildInterpretationContext:
    def test_labels_each_role_distinctly(self):
        ctx = build_interpretation_context(
            [
                Message(role="user", content="hi"),
                Message(role="behaviour", content="thought: x"),
                Message(role="assistant", content="hello"),
            ],
            "- fact",
        )
        assert "User: hi" in ctx
        assert "Agent did: thought: x" in ctx
        assert "Assistant: hello" in ctx
        assert "Memory facts to interpret:\n- fact" in ctx

    def test_drops_oldest_when_budget_exceeded(self):
        msgs = [Message(role="user", content=f"msg-{i} " + "x" * 100) for i in range(200)]
        ctx = build_interpretation_context(msgs, "- fact", char_budget=500)
        assert "msg-199" in ctx
        assert "msg-0" not in ctx

    def test_skips_messages_with_blank_content(self):
        ctx = build_interpretation_context(
            [
                Message(role="user", content="   "),
                Message(role="assistant", content="hello"),
            ],
            "- fact",
        )
        assert "User:" not in ctx
        assert "Assistant: hello" in ctx

    def test_default_char_budget_is_exposed(self):
        assert INTERPRET_CHAR_BUDGET > 0
