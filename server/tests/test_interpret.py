"""Tree: interpret-facts (Python).

Shared helper used by /recall and /tools/memory_search. Fails fast when LLM
is absent or empty.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from pipelines.interpret import INTERPRET_SYSTEM_PROMPT, InterpretResult, interpret_facts
from pipelines.message_clean import ConversationMessage


@pytest.fixture
def mock_llm_client():
    client = AsyncMock()
    client.generate_response = AsyncMock(return_value={"text": "relevant interpretation"})
    return client


class TestInterpretFacts:
    async def test_raises_when_llm_client_is_none(self):
        with pytest.raises(RuntimeError, match="llm_client is required"):
            await interpret_facts(
                [ConversationMessage(role="user", text="hi")],
                "- fact 1",
                None,
            )

    async def test_raises_when_llm_returns_empty_text(self, mock_llm_client):
        mock_llm_client.generate_response.return_value = {"text": ""}
        with pytest.raises(RuntimeError, match="empty interpretation"):
            await interpret_facts(
                [ConversationMessage(role="user", text="hi")],
                "- fact 1",
                mock_llm_client,
            )

    async def test_raises_when_llm_returns_whitespace_only(self, mock_llm_client):
        mock_llm_client.generate_response.return_value = {"text": "   \n  "}
        with pytest.raises(RuntimeError, match="empty interpretation"):
            await interpret_facts(
                [ConversationMessage(role="user", text="hi")],
                "- fact 1",
                mock_llm_client,
            )

    async def test_returns_stripped_text_on_success(self, mock_llm_client):
        mock_llm_client.generate_response.return_value = {"text": "  the answer  "}
        result = await interpret_facts(
            [ConversationMessage(role="user", text="hi")],
            "- fact 1",
            mock_llm_client,
        )
        assert result == "the answer"

    async def test_passes_system_prompt_and_context(self, mock_llm_client):
        await interpret_facts(
            [ConversationMessage(role="user", text="what's up")],
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
            [ConversationMessage(role="user", text="q")],
            "- fact",
            mock_llm_client,
        )
        call = mock_llm_client.generate_response.await_args
        assert call.kwargs.get("response_model") is InterpretResult
        assert call.kwargs.get("max_tokens") == 500
