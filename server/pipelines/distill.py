from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING

from pydantic import BaseModel

from .messages import Message, label_for

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


class DistillResult(BaseModel):
    behaviour: str


def _build_distill_input(messages: list[Message]) -> str:
    has_behaviour = any(m.role == "behaviour" and m.content.strip() for m in messages)
    if not has_behaviour:
        return ""

    lines: list[str] = []
    for msg in messages:
        text = msg.content.strip()
        if not text:
            continue
        lines.append(f"{label_for(msg.role)}: {text}")
    return "\n".join(lines)


async def _distill_one(llm_client: "LLMClient", thinking: str) -> str:
    from graphiti_core.prompts.models import Message as LLMMessage

    prompt = [
        LLMMessage(role="system", content=DISTILL_SYSTEM_PROMPT),
        LLMMessage(role="user", content=thinking),
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
    turns: list[list[Message]],
    llm_client: "LLMClient | None",
) -> str:
    distill_inputs = [(i, _build_distill_input(turn)) for i, turn in enumerate(turns)]
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
        user_texts = [m.content.strip() for m in turn if m.role == "user" and m.content.strip()]
        for text in user_texts:
            lines.append(f"User: {text}")

        summary = summaries.get(i)
        if summary:
            lines.append(f"Assistant: (behaviour: {summary})")

        answer_texts = [
            m.content.strip() for m in turn if m.role == "assistant" and m.content.strip()
        ]
        for text in answer_texts:
            lines.append(f"Assistant: {text}")
    return "\n".join(lines)
