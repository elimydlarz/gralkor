"""Tree: interpret-facts (Python).

Filters recalled facts for relevance against the in-flight conversation.
Returns a list of one-sentence entries (fact + why relevant).
Empty list is the explicit "nothing relevant" outcome.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from pipelines.interpret import (
    INTERPRET_CHAR_BUDGET,
    InterpretResult,
    build_interpretation_context,
    interpret_facts,
)
from pipelines.messages import Message


@pytest.fixture
def mock_llm_client():
    client = AsyncMock()
    client.generate_response = AsyncMock(return_value={"relevantFacts": ["Alice knows Bob — names a colleague."]})
    return client


class TestInterpretFacts:
    class TestCallsLlmClientWithConversationAndFormattedFacts:
        async def test_response_model_field_describes_verbatim_fact_plus_reason(self):
            description = InterpretResult.model_fields["relevantFacts"].description
            assert description is not None
            assert "verbatim" in description
            assert "(valid from" in description
            assert "(expired" in description
            assert "—" in description

        async def test_returns_the_list_when_llm_returns_relevant_facts(self, mock_llm_client):
            mock_llm_client.generate_response.return_value = {
                "relevantFacts": [
                    "Alice knows Bob (valid from 2024-01-01) — Bob is the user's question subject.",
                    "Alice's email is a@x (expired 2025-06-01) — needed to answer the email question.",
                ]
            }
            result = await interpret_facts(
                [Message(role="user", content="who is bob")],
                "- Alice knows Bob (valid from 2024-01-01)",
                mock_llm_client,
                "TestAgent",
            )
            assert result == [
                "Alice knows Bob (valid from 2024-01-01) — Bob is the user's question subject.",
                "Alice's email is a@x (expired 2025-06-01) — needed to answer the email question.",
            ]

        async def test_returns_empty_list_when_llm_returns_empty_list(self, mock_llm_client):
            mock_llm_client.generate_response.return_value = {"relevantFacts": []}
            result = await interpret_facts(
                [Message(role="user", content="who is bob")],
                "- unrelated fact",
                mock_llm_client,
                "TestAgent",
            )
            assert result == []

        async def test_raises_when_llm_response_is_malformed(self, mock_llm_client):
            mock_llm_client.generate_response.return_value = {"text": "old shape"}
            with pytest.raises(RuntimeError, match="malformed"):
                await interpret_facts(
                    [Message(role="user", content="hi")],
                    "- fact",
                    mock_llm_client,
                    "TestAgent",
                )

    class TestWhenLlmClientIsNone:
        async def test_raises(self):
            with pytest.raises(RuntimeError, match="llm_client is required"):
                await interpret_facts(
                    [Message(role="user", content="hi")],
                    "- fact 1",
                    None,
                    "TestAgent",
                )


class TestBuildInterpretationContext:
    def test_labels_each_role_distinctly(self):
        ctx = build_interpretation_context(
            [
                Message(role="user", content="hi"),
                Message(role="behaviour", content="thought: x"),
                Message(role="assistant", content="hello"),
            ],
            "- fact",
            "TestAgent",
        )
        assert "User: hi" in ctx
        assert "TestAgent: (behaviour: thought: x)" in ctx
        assert "TestAgent: hello" in ctx
        assert "Memory facts to interpret:\n- fact" in ctx

    def test_drops_oldest_when_budget_exceeded(self):
        msgs = [Message(role="user", content=f"msg-{i} " + "x" * 100) for i in range(200)]
        ctx = build_interpretation_context(msgs, "- fact", "TestAgent", char_budget=500)
        assert "msg-199" in ctx
        assert "msg-0" not in ctx

    def test_skips_messages_with_blank_content(self):
        ctx = build_interpretation_context(
            [
                Message(role="user", content="   "),
                Message(role="assistant", content="hello"),
            ],
            "- fact",
            "TestAgent",
        )
        assert "User:" not in ctx
        assert "TestAgent: hello" in ctx

    def test_default_char_budget_is_exposed(self):
        assert INTERPRET_CHAR_BUDGET > 0


class TestAgentNameValidation:
    async def test_interpret_facts_blank_agent_name_raises(self, mock_llm_client):
        with pytest.raises(ValueError, match="agent_name"):
            await interpret_facts(
                [Message(role="user", content="hi")],
                "- fact",
                mock_llm_client,
                "",
            )

    async def test_interpret_facts_whitespace_agent_name_raises(self, mock_llm_client):
        with pytest.raises(ValueError, match="agent_name"):
            await interpret_facts(
                [Message(role="user", content="hi")],
                "- fact",
                mock_llm_client,
                "  ",
            )

    def test_build_context_blank_agent_name_raises(self):
        with pytest.raises(ValueError, match="agent_name"):
            build_interpretation_context(
                [Message(role="user", content="hi")],
                "- fact",
                "",
            )
