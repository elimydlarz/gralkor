from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel

if TYPE_CHECKING:
    from graphiti_core.llm_client import LLMClient


logger = logging.getLogger(__name__)


DISTILL_SYSTEM_PROMPT = (
    "You are a distillery for agentic thought and action. You will be given an agent's actions "
    "during a turn, alongside the user's request and the agent's response for context. Write one "
    "to two sentences in first person past tense capturing the reasoning, decisions, and actions "
    "that drove the outcome — including dead ends and intermediary steps, not just the final "
    "response. When the agent searched memory, do not restate the recalled facts — note only "
    "that memory was consulted and what the agent concluded. Output only the distilled text."
)


@dataclass
class Turn:
    user_query: str
    events: list[Any] = field(default_factory=list)
    assistant_answer: str = ""


class DistillResult(BaseModel):
    behaviour: str


def _serialize_event(event: Any) -> str:
    if isinstance(event, str):
        return event.strip()
    try:
        return json.dumps(event, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(event)


def _build_distill_input(turn: Turn) -> str:
    events_text = "\n---\n".join(
        rendered for event in turn.events if (rendered := _serialize_event(event))
    ).strip()
    if not events_text:
        return ""

    sections: list[str] = []
    user_text = turn.user_query.strip()
    if user_text:
        sections.append(f"User: {user_text}")
    sections.append(f"Actions:\n{events_text}")
    response_text = turn.assistant_answer.strip()
    if response_text:
        sections.append(f"Response: {response_text}")
    return "\n\n".join(sections)


async def _distill_one(llm_client: "LLMClient", thinking: str) -> str:
    from graphiti_core.prompts.models import Message

    prompt = [
        Message(role="system", content=DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    response = await llm_client.generate_response(
        prompt,
        response_model=DistillResult,
        max_tokens=150,
    )
    if isinstance(response, dict):
        return (response.get("behaviour") or "").strip()
    return ""


async def safe_distill(llm_client: "LLMClient", thinking: str) -> str:
    if not thinking.strip():
        return ""
    try:
        return await _distill_one(llm_client, thinking)
    except Exception as err:
        logger.warning("behaviour distillation failed: %s", err)
        return ""


async def format_transcript(
    turns: list[Turn],
    llm_client: "LLMClient | None",
) -> str:
    distill_inputs = [(i, _build_distill_input(t)) for i, t in enumerate(turns)]
    distill_inputs = [(i, text) for i, text in distill_inputs if text]

    summaries: dict[int, str] = {}
    if distill_inputs and llm_client is not None:
        results = await asyncio.gather(
            *(safe_distill(llm_client, text) for _, text in distill_inputs)
        )
        for (i, _), summary in zip(distill_inputs, results):
            if summary:
                summaries[i] = summary

    lines: list[str] = []
    for i, turn in enumerate(turns):
        user_text = turn.user_query.strip()
        if user_text:
            lines.append(f"User: {user_text}")
        summary = summaries.get(i)
        if summary:
            lines.append(f"Assistant: (behaviour: {summary})")
        answer_text = turn.assistant_answer.strip()
        if answer_text:
            lines.append(f"Assistant: {answer_text}")
    return "\n".join(lines)
