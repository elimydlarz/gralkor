from __future__ import annotations

import re
from typing import Any


_FRACTIONAL_SECONDS = re.compile(r"\.\d+")
_TRAILING_Z = re.compile(r"Z$")
_TZ_OFFSET = re.compile(r"([+-])(\d{2}):(\d{2})$")


def format_timestamp(ts: str) -> str:
    s = _FRACTIONAL_SECONDS.sub("", ts)
    s = _TRAILING_Z.sub("+0", s)

    def _compact(match: re.Match[str]) -> str:
        sign, hours_str, minutes_str = match.group(1), match.group(2), match.group(3)
        hours = str(int(hours_str))
        if minutes_str == "00":
            return f"{sign}{hours}"
        return f"{sign}{hours}:{minutes_str}"

    return _TZ_OFFSET.sub(_compact, s)


def format_fact(fact: dict[str, Any]) -> str:
    parts = [f"- {fact['fact']}"]
    if fact.get("created_at"):
        parts.append(f" (created {format_timestamp(fact['created_at'])})")
    if fact.get("valid_at"):
        parts.append(f" (valid from {format_timestamp(fact['valid_at'])})")
    if fact.get("invalid_at"):
        parts.append(f" (invalid since {format_timestamp(fact['invalid_at'])})")
    if fact.get("expired_at"):
        parts.append(f" (expired {format_timestamp(fact['expired_at'])})")
    return "".join(parts)


def format_facts(facts: list[dict[str, Any]]) -> str:
    if not facts:
        return "No graph facts found."
    lines = "\n".join(format_fact(f) for f in facts)
    return f"Facts:\n{lines}"


def format_node(node: dict[str, Any]) -> str:
    summary = node.get("summary") or "(no summary)"
    return f"- {node['name']}: {summary}"
