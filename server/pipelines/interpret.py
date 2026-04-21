from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel

from .messages import Message, label_for

if TYPE_CHECKING:
    from graphiti_core.llm_client import LLMClient


INTERPRET_SYSTEM_PROMPT = (
    "You are reviewing recalled memory facts for an agent mid-conversation. "
    "Given the conversation so far and the facts retrieved from memory, identify "
    "which facts are relevant to the current task and explain concisely how each "
    "one helps. Skip facts with no bearing on the current task. "
    "Be direct — one sentence per fact. Output only the interpretation, nothing else."
)

INTERPRET_TOKEN_BUDGET = 250_000
_CHARS_PER_TOKEN = 4
INTERPRET_CHAR_BUDGET = INTERPRET_TOKEN_BUDGET * _CHARS_PER_TOKEN


_ROLE_LABEL: dict[str, str] = {
    "user": "User",
    "assistant": "Assistant",
    "behaviour": "Agent did",
}


class InterpretResult(BaseModel):
    text: str


def _label(role: str) -> str:
    return _ROLE_LABEL.get(role, role.capitalize())


def build_interpretation_context(
    messages: list[Message],
    facts_text: str,
    char_budget: int = INTERPRET_CHAR_BUDGET,
) -> str:
    lines: list[str] = []
    for msg in messages:
        text = msg.content.strip()
        if not text:
            continue
        lines.append(f"{_label(msg.role)}: {text}")

    budget = char_budget
    trimmed: list[str] = []
    for line in reversed(lines):
        if budget <= 0:
            break
        trimmed.insert(0, line)
        budget -= len(line)

    return (
        "Conversation context:\n"
        + "\n".join(trimmed)
        + "\n\nMemory facts to interpret:\n"
        + facts_text
    )


async def interpret_facts(
    messages: list[Message],
    facts_text: str,
    llm_client: "LLMClient",
) -> str:
    if llm_client is None:
        raise RuntimeError(
            "interpret_facts: llm_client is required (configure an LLM provider API key)"
        )

    from graphiti_core.prompts.models import Message as LLMMessage

    context = build_interpretation_context(messages, facts_text)
    prompt = [
        LLMMessage(role="system", content=INTERPRET_SYSTEM_PROMPT),
        LLMMessage(role="user", content=context),
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
