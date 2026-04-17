from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal

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


EpisodeBlockType = Literal["text", "thinking", "tool_use", "tool_result"]


@dataclass(frozen=True)
class EpisodeBlock:
    type: EpisodeBlockType
    text: str


@dataclass(frozen=True)
class EpisodeMessage:
    role: Literal["user", "assistant"]
    content: list[EpisodeBlock]


@dataclass
class TurnEvent:
    kind: Literal["thinking", "tool_use", "tool_result"]
    text: str


@dataclass
class Turn:
    user_query: str
    events: list[TurnEvent]
    assistant_answer: str


@dataclass
class _ParsedTurn:
    user_lines: list[str] = field(default_factory=list)
    behaviour: list[str] = field(default_factory=list)
    assistant_lines: list[str] = field(default_factory=list)


class DistillResult(BaseModel):
    behaviour: str


def turns_to_episode_messages(turns: list[Turn]) -> list[EpisodeMessage]:
    messages: list[EpisodeMessage] = []
    for turn in turns:
        if turn.user_query.strip():
            messages.append(
                EpisodeMessage(
                    role="user",
                    content=[EpisodeBlock(type="text", text=turn.user_query)],
                )
            )
        assistant_blocks: list[EpisodeBlock] = [
            EpisodeBlock(type=event.kind, text=event.text) for event in turn.events
        ]
        if turn.assistant_answer.strip():
            assistant_blocks.append(EpisodeBlock(type="text", text=turn.assistant_answer))
        if assistant_blocks:
            messages.append(EpisodeMessage(role="assistant", content=assistant_blocks))
    return messages


def _parse_turns(messages: list[EpisodeMessage]) -> list[_ParsedTurn]:
    parsed: list[_ParsedTurn] = [_ParsedTurn()]
    for msg in messages:
        if msg.role == "user":
            parsed.append(_ParsedTurn())
            for block in msg.content:
                if block.type == "text":
                    parsed[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    parsed[-1].behaviour.append(block.text)
                elif block.type == "text":
                    parsed[-1].assistant_lines.append(block.text)
    return parsed


def _build_distill_input(turn: _ParsedTurn) -> str:
    behaviour_text = "\n---\n".join(turn.behaviour).strip()
    if not behaviour_text:
        return ""
    sections: list[str] = []
    user_text = "\n".join(turn.user_lines).strip()
    if user_text:
        sections.append(f"User: {user_text}")
    sections.append(f"Actions:\n{behaviour_text}")
    response_text = "\n".join(turn.assistant_lines).strip()
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
    messages: list[EpisodeMessage],
    llm_client: "LLMClient | None",
) -> str:
    turns = _parse_turns(messages)
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
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        summary = summaries.get(i)
        if summary:
            lines.append(f"Assistant: (behaviour: {summary})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")
    return "\n".join(lines)
