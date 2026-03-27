"""Live distillation tests — calls real LLM to verify prompt quality.

Requires GOOGLE_API_KEY or OPENAI_API_KEY. Run with:
    cd server && uv run pytest tests/test_distillation_live.py -v -s

Each case loads behaviour blocks from fixtures/distillation_cases.json,
sends them through _distill_one with a real LLM client, and checks that
the output follows the distillation guidelines (no echoed recall, etc.).
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from main import _distill_one, _build_llm_client

FIXTURES = Path(__file__).parent / "fixtures" / "distillation_cases.json"


def _load_cases() -> list[dict]:
    with open(FIXTURES) as f:
        return json.load(f)


def _build_input(blocks: list[dict]) -> str:
    """Join blocks with --- separator, same as _format_transcript does."""
    return "\n---\n".join(b["text"] for b in blocks)


class _OpenAITextClient:
    """Thin wrapper around OpenAI that doesn't force JSON mode."""

    def __init__(self, model: str = "gpt-4o-mini"):
        from openai import AsyncOpenAI
        self._client = AsyncOpenAI()
        self._model = model

    async def generate_response(self, messages, max_tokens=300, **kwargs):
        resp = await self._client.chat.completions.create(
            model=self._model,
            messages=[{"role": m.role, "content": m.content} for m in messages],
            max_tokens=max_tokens,
        )
        return {"content": resp.choices[0].message.content or ""}


@pytest.fixture(scope="module")
def llm_client():
    """Build a real LLM client from env. Skip if no API key."""
    if os.environ.get("GOOGLE_API_KEY"):
        return _build_llm_client({"llm": {"provider": "gemini", "model": "gemini-2.0-flash"}})
    if os.environ.get("OPENAI_API_KEY"):
        return _OpenAITextClient()
    pytest.skip("No LLM API key (set GOOGLE_API_KEY or OPENAI_API_KEY)")


CASES = _load_cases()


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
@pytest.mark.asyncio
async def test_distillation_quality(llm_client, case):
    """Verify distillation output follows guidelines for each case."""
    input_text = _build_input(case["blocks"])
    result = await _distill_one(llm_client, input_text)

    print(f"\n{'='*60}")
    print(f"CASE: {case['name']}")
    print(f"DESC: {case['description']}")
    print(f"{'─'*60}")
    print(f"OUTPUT: {result}")
    print(f"{'─'*60}")

    # Must produce non-empty output
    assert result, f"Distillation returned empty for case '{case['name']}'"

    # Must be first person
    assert any(
        result.lower().startswith(p) for p in ("i ", "i'")
    ), f"Expected first-person output, got: {result[:50]}..."

    # Check reject patterns — content from recalled facts that should NOT appear
    result_lower = result.lower()
    violations = []
    for pattern in case.get("reject_patterns", []):
        if pattern.lower() in result_lower:
            violations.append(pattern)

    if violations:
        print(f"REJECT VIOLATIONS: {violations}")

    assert not violations, (
        f"Distillation echoed recalled content for '{case['name']}': "
        f"found {violations} in output: {result}"
    )

    # Check expect patterns — things that SHOULD appear
    for pattern in case.get("expect_patterns", []):
        assert pattern.lower() in result_lower, (
            f"Expected '{pattern}' in output for '{case['name']}': {result}"
        )
