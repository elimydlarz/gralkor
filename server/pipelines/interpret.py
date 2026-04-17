from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

from .message_clean import ConversationMessage, build_interpretation_context

if TYPE_CHECKING:
    from graphiti_core.llm_client import LLMClient


INTERPRET_SYSTEM_PROMPT = (
    "You are reviewing recalled memory facts for an agent mid-conversation. "
    "Given the conversation so far and the facts retrieved from memory, identify "
    "which facts are relevant to the current task and explain concisely how each "
    "one helps. Skip facts with no bearing on the current task. "
    "Be direct — one sentence per fact. Output only the interpretation, nothing else."
)


class InterpretResult(BaseModel):
    text: str


async def interpret_facts(
    messages: list[ConversationMessage],
    facts_text: str,
    llm_client: "LLMClient",
) -> str:
    if llm_client is None:
        raise RuntimeError(
            "interpret_facts: llm_client is required (configure an LLM provider API key)"
        )

    from graphiti_core.prompts.models import Message

    context = build_interpretation_context(messages, facts_text)
    prompt = [
        Message(role="system", content=INTERPRET_SYSTEM_PROMPT),
        Message(role="user", content=context),
    ]

    response = await llm_client.generate_response(
        prompt,
        response_model=InterpretResult,
        max_tokens=500,
    )
    text = (response.get("text") or "").strip() if isinstance(response, dict) else ""
    if not text:
        raise RuntimeError("interpret_facts: llm_client returned empty interpretation")
    return text
