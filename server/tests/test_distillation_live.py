"""Live distillation tests — calls real LLM to verify prompt quality.

Run with:
    cd server && uv run pytest tests/test_distillation_live.py -v -s

Each case loads behaviour blocks from fixtures/distillation_cases.json,
sends them through _distill_one with a real LLM client, and checks that
the output follows the distillation guidelines (no echoed recall, etc.).
"""

from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path

import pytest

from main import _distill_one, _build_llm_client, _load_config

FIXTURES = Path(__file__).parent / "fixtures" / "distillation_cases.json"


def _load_cases() -> list[dict]:
    with open(FIXTURES) as f:
        return json.load(f)


def _build_input(blocks: list[dict]) -> str:
    """Join blocks with --- separator, same as _format_transcript does."""
    return "\n---\n".join(b["text"] for b in blocks)


@pytest.fixture
def llm_client():
    """Build the same LLM client the server uses (config.yaml + env keys).

    Reads CONFIG_PATH or falls back to ../config.yaml (project root).
    Gemini accepts GEMINI_API_KEY as an alias for GOOGLE_API_KEY.

    Function-scoped (not module) so the async HTTP session matches each
    test's event loop — prevents "Event loop is closed" errors.
    """
    # Gemini SDK reads GOOGLE_API_KEY; copy GEMINI_API_KEY if that's what's set
    if not os.environ.get("GOOGLE_API_KEY") and os.environ.get("GEMINI_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

    # Try server's config path, then project root config
    cfg = _load_config()
    if not cfg.get("llm"):
        root_cfg = Path(__file__).parent.parent.parent / "config.yaml"
        if root_cfg.exists():
            import yaml
            with open(root_cfg) as f:
                cfg = yaml.safe_load(f) or {}

    return _build_llm_client(cfg)


CASES = _load_cases()


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
@pytest.mark.asyncio
async def test_distillation_quality(llm_client, case):
    """Verify distillation output follows guidelines for each case."""
    input_text = _build_input(case["blocks"])

    # Retry with backoff for rate limits
    result = ""
    for attempt in range(3):
        try:
            result = await _distill_one(llm_client, input_text)
            break
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower() or "quota" in str(e).lower():
                wait = 2 ** attempt * 5
                print(f"  Rate limited, waiting {wait}s (attempt {attempt + 1}/3)")
                await asyncio.sleep(wait)
            else:
                raise

    # Show input and output side by side for eyeballing
    print(f"\n{'='*60}")
    print(f"CASE: {case['name']}")
    print(f"{'─'*60}")
    print("INPUT:")
    for block in case["blocks"]:
        tag = block["type"].upper()
        # Truncate long tool results to keep output scannable
        text = block["text"]
        if len(text) > 200:
            text = text[:200] + "..."
        print(f"  [{tag}] {text}")
    print(f"{'─'*60}")
    print(f"OUTPUT: {result}")
    if case.get("reject_patterns"):
        print(f"MUST NOT CONTAIN: {case['reject_patterns']}")
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
