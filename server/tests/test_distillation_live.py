"""Live distillation tests — calls real LLM to verify prompt quality.

Run with:
    cd server && uv run pytest tests/test_distillation_live.py -v -s

Each case loads behaviour blocks from fixtures/distillation_cases.json,
sends them through _distill_one with a real LLM client, and checks that
the output follows the distillation guidelines.

Cases with ``reject_patterns`` are auto-checked (hard string match for
values that must never appear, like credential numbers).

Cases with ``judge_guideline`` write results to
tests/distillation_results/ for human review — the guideline and output
are placed side-by-side so the reviewer can evaluate quality.
"""

from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

import pytest

from main import _distill_one, _build_llm_client, _load_config

FIXTURES = Path(__file__).parent / "fixtures" / "distillation_cases.json"
RESULTS_DIR = Path(__file__).parent / "distillation_results"


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


def _write_result(case: dict, result: str) -> Path:
    """Write distillation result to a review file. Returns the file path."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = RESULTS_DIR / f"{case['name']}_{ts}.md"

    lines = [
        f"# {case['name']}",
        "",
        f"**Description:** {case['description']}",
        "",
        "## Guideline",
        "",
        case.get("judge_guideline", "(no guideline — uses reject_patterns)"),
        "",
        "## Input blocks",
        "",
    ]
    for block in case["blocks"]:
        text = block["text"]
        if len(text) > 300:
            text = text[:300] + "..."
        lines.append(f"**[{block['type'].upper()}]** {text}")
        lines.append("")

    lines.extend([
        "## Distillation output",
        "",
        f"> {result}",
        "",
    ])

    path.write_text("\n".join(lines))
    return path


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
@pytest.mark.asyncio
async def test_distillation_quality(llm_client, case):
    """Verify distillation output follows guidelines for each case."""
    input_text = _build_input(case["blocks"])

    # Retry with backoff for rate limits; skip test if exhausted
    result = ""
    last_error = None
    for attempt in range(3):
        try:
            result = await _distill_one(llm_client, input_text)
            break
        except Exception as e:
            if "429" in str(e) or "rate" in str(e).lower() or "quota" in str(e).lower():
                last_error = e
                wait = 2 ** attempt * 5
                print(f"  Rate limited, waiting {wait}s (attempt {attempt + 1}/3)")
                await asyncio.sleep(wait)
            else:
                raise
    else:
        pytest.skip(f"Rate-limited after 3 attempts: {last_error}")

    # Must produce non-empty output
    assert result, f"Distillation returned empty for case '{case['name']}'"

    # Must be first person
    assert any(
        result.lower().startswith(p) for p in ("i ", "i'")
    ), f"Expected first-person output, got: {result[:50]}..."

    # Cases with reject_patterns: hard string match (for literal values like credentials)
    if case.get("reject_patterns"):
        result_lower = result.lower()
        violations = [p for p in case["reject_patterns"] if p.lower() in result_lower]
        assert not violations, (
            f"Distillation echoed rejected content for '{case['name']}': "
            f"found {violations} in output: {result}"
        )

    # Cases with judge_guideline: write results for human review
    if case.get("judge_guideline"):
        path = _write_result(case, result)
        print(f"\n  Review: {path}")
