from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from .messages import Message, label_for

if TYPE_CHECKING:
    from graphiti_core.llm_client import LLMClient


INTERPRET_SYSTEM_PROMPT = (
    "You are reviewing recalled memory facts for an agent mid-conversation. "
    "Each input fact is one line beginning with '- ' and may carry one or more "
    "timestamp parentheticals such as '(created …)', '(valid from …)', "
    "'(invalid since …)', '(expired …)'.\n\n"
    "Return only the facts that bear on the current task. For each one, produce "
    "a single string built from two parts joined by ' — ':\n"
    "  1. The original fact copied verbatim WITHOUT the leading '- '. Preserve "
    "every timestamp parenthetical exactly as given. Do not paraphrase, "
    "summarise, merge facts, drop timestamps, or reformat them.\n"
    "  2. One short sentence explaining why this fact is relevant to the "
    "current task.\n\n"
    "Example output entry: "
    "'Alice works at Acme (valid from 2024-01-01) (expired 2025-06-01) — "
    "confirms her former employer, which the user just asked about.'\n\n"
    "Skip facts with no bearing on the current task. If no facts are relevant, "
    "return an empty list. Do not return prose, prefixes, bullets, numbering, "
    "or any wrapping object — only the list of strings in the schema."
)

INTERPRET_TOKEN_BUDGET = 250_000
_CHARS_PER_TOKEN = 4
INTERPRET_CHAR_BUDGET = INTERPRET_TOKEN_BUDGET * _CHARS_PER_TOKEN


class InterpretResult(BaseModel):
    relevantFacts: list[str] = Field(
        description=(
            "List of relevant facts. Each entry is the original fact line "
            "copied verbatim (without the leading '- ', preserving every "
            "timestamp parenthetical such as '(valid from …)', '(invalid "
            "since …)', '(expired …)', '(created …)'), followed by ' — ' "
            "and one short sentence explaining why this fact is relevant. "
            "Empty list if nothing is relevant. No prose, no bullets, no "
            "numbering."
        )
    )


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
        lines.append(f"{label_for(msg.role)}: {text}")

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
) -> list[str]:
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
    if not isinstance(response, dict):
        raise RuntimeError("interpret_facts: malformed response (not a dict)")
    raw = response.get("relevantFacts")
    if not isinstance(raw, list):
        raise RuntimeError("interpret_facts: malformed response (relevantFacts missing or not a list)")
    return [str(item).strip() for item in raw if str(item).strip()]
