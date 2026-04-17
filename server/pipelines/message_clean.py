from __future__ import annotations

import re
from dataclasses import dataclass


SYSTEM_MESSAGE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^A new session was started\b"),
    re.compile(r"^Current time:", re.IGNORECASE),
    re.compile(r"^✅?\s*New session started\b"),
    re.compile(r"^System: "),
    re.compile(r"^\[User sent media without caption\]$"),
]

SYSTEM_MESSAGE_MULTILINE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(
        r"^Based on this conversation, generate a short \d+-\d+ word filename slug"
        r"[\s\S]*Reply with ONLY the slug"
    ),
]

_GRALKOR_MEMORY_XML = re.compile(r"<gralkor-memory[\s\S]*?</gralkor-memory>\n*")
_METADATA_WRAPPER = re.compile(
    r"[^\n]+\(untrusted(?: metadata|, for context)\):\n```json\n[\s\S]*?\n```\n*"
)
_UNTRUSTED_FOOTER = re.compile(r"\n*Untrusted context \(metadata[^)]*\):\n[\s\S]*$")

INTERPRET_TOKEN_BUDGET = 250_000
_CHARS_PER_TOKEN = 4
INTERPRET_CHAR_BUDGET = INTERPRET_TOKEN_BUDGET * _CHARS_PER_TOKEN


@dataclass(frozen=True)
class ConversationMessage:
    role: str
    text: str


def strip_gralkor_memory_xml(text: str) -> str:
    return _GRALKOR_MEMORY_XML.sub("", text)


def is_system_message(text: str) -> bool:
    trimmed = text.strip()
    if not trimmed:
        return True
    return any(p.search(trimmed) for p in SYSTEM_MESSAGE_PATTERNS)


def is_system_line(line: str) -> bool:
    trimmed = line.strip()
    if not trimmed:
        return False
    return any(p.search(trimmed) for p in SYSTEM_MESSAGE_PATTERNS)


def clean_user_message_text(text: str) -> str:
    if not text.strip():
        return ""

    if any(p.search(text.strip()) for p in SYSTEM_MESSAGE_MULTILINE_PATTERNS):
        return ""

    cleaned = _METADATA_WRAPPER.sub("", text)
    cleaned = strip_gralkor_memory_xml(cleaned)
    cleaned = _UNTRUSTED_FOOTER.sub("", cleaned)
    cleaned = "\n".join(line for line in cleaned.split("\n") if not is_system_line(line))
    return cleaned.strip()


def build_interpretation_context(
    messages: list[ConversationMessage],
    facts_text: str,
    char_budget: int = INTERPRET_CHAR_BUDGET,
) -> str:
    lines: list[str] = []
    for msg in messages:
        cleaned = clean_user_message_text(msg.text) if msg.role == "user" else msg.text.strip()
        if not cleaned:
            continue
        role_label = "User" if msg.role == "user" else "Assistant"
        lines.append(f"{role_label}: {cleaned}")

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
