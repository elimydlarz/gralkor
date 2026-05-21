from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, Field

from .messages import Message

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

DEFAULT_OUTPUT_TOKEN_BUDGET = 2000


class InterpretParseFailed(Exception):
    """Raised when the LLM's interpret response cannot be parsed against the
    InterpretResult schema — typically because output_token_budget was too
    small and the response truncated mid-list. Distinct from generic
    RuntimeError so callers can catch parse failure specifically."""

    def __init__(self, message: str, raw_response: object = None) -> None:
        super().__init__(message)
        self.raw_response = raw_response


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


def _require_agent_name(agent_name: str) -> None:
    if agent_name is None or not str(agent_name).strip():
        raise ValueError("agent_name is required and must be non-blank")


def _require_positive_int(name: str, value: object) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or value <= 0:
        raise ValueError(f"{name} must be a positive integer, got {value!r}")
    return value


def _render_label(role: str, agent_name: str) -> str:
    if role == "user":
        return "User"
    if role == "assistant":
        return agent_name
    if role == "behaviour":
        return agent_name
    return role.capitalize()


def _budget_instruction(output_token_budget: int) -> str:
    return (
        f"Respond within {output_token_budget} tokens. Keep each relevance "
        f"reason short so the full list fits."
    )


def build_interpretation_context(
    messages: list[Message],
    facts_text: str,
    agent_name: str,
    char_budget: int = INTERPRET_CHAR_BUDGET,
) -> str:
    _require_agent_name(agent_name)
    lines: list[str] = []
    for msg in messages:
        text = msg.content.strip()
        if not text:
            continue
        if msg.role == "behaviour":
            lines.append(f"{agent_name}: (behaviour: {text})")
        else:
            lines.append(f"{_render_label(msg.role, agent_name)}: {text}")

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
    agent_name: str,
    output_token_budget: int = DEFAULT_OUTPUT_TOKEN_BUDGET,
) -> list[str]:
    _require_agent_name(agent_name)
    _require_positive_int("output_token_budget", output_token_budget)
    if llm_client is None:
        raise RuntimeError(
            "interpret_facts: llm_client is required (configure an LLM provider API key)"
        )

    from graphiti_core.prompts.models import Message as LLMMessage

    context = build_interpretation_context(messages, facts_text, agent_name)
    context_with_budget = context + "\n\n" + _budget_instruction(output_token_budget)
    prompt = [
        LLMMessage(role="system", content=INTERPRET_SYSTEM_PROMPT),
        LLMMessage(role="user", content=context_with_budget),
    ]

    response = await llm_client.generate_response(
        prompt,
        response_model=InterpretResult,
        max_tokens=output_token_budget,
    )
    if not isinstance(response, dict):
        raise InterpretParseFailed(
            "interpret_facts: response was not a dict (schema mismatch or truncation)",
            raw_response=response,
        )
    raw = response.get("relevantFacts")
    if not isinstance(raw, list):
        raise InterpretParseFailed(
            "interpret_facts: relevantFacts missing or not a list (schema mismatch or truncation)",
            raw_response=response,
        )
    return [str(item).strip() for item in raw if str(item).strip()]
