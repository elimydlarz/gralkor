"""Live distillation tests — calls real LLM to verify prompt quality.

Run with:
    cd server && uv run pytest tests/test_distillation_live.py -v -s

Each case loads behaviour blocks from fixtures/distillation_cases.json,
sends them through _distill_one with a real LLM client, and writes
results to tests/distillation_results/ for human review against the
behaviour-distillation test tree in CLAUDE.md.

The test only asserts mechanical properties (non-empty, first-person).
Quality evaluation is done by reviewing the output against the test tree.
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

# The test tree from CLAUDE.md — evaluation criteria for review.
EVALUATION_CRITERIA = """\
_format_transcript (server-side)
  when assistant message has thinking blocks
    then grouped into behaviour for that turn
  when assistant message has tool_use blocks
    then grouped into behaviour for that turn
  when assistant message has tool_result blocks
    then grouped into behaviour for that turn
  when turn has behaviour blocks and llm_client available
    then blocks joined with --- separator
    and distilled via LLM into first-person past-tense summary
    and injected as "Assistant: (behaviour: {summary})" before assistant text
  when behaviour blocks contain memory_search results (recalled facts)
    then distillation describes the intent (e.g. "consulted memory")
    and does NOT restate the recalled fact content
  when behaviour blocks contain thinking that references recalled data
    then distillation captures the reasoning and decisions
    and does NOT echo the specific data that was recalled
  when distillation fails for a turn
    then behaviour line silently dropped, assistant text preserved
  when turn has only text blocks (no behaviour)
    then text rendered as "Assistant: {text}" with no behaviour line
  user messages
    then rendered as "User: {text}"
"""


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
    if not os.environ.get("GOOGLE_API_KEY") and os.environ.get("GEMINI_API_KEY"):
        os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

    cfg = _load_config()
    if not cfg.get("llm"):
        root_cfg = Path(__file__).parent.parent.parent / "config.yaml"
        if root_cfg.exists():
            import yaml
            with open(root_cfg) as f:
                cfg = yaml.safe_load(f) or {}

    return _build_llm_client(cfg)


CASES = _load_cases()

# Collect results across all cases, written to a single file at the end.
_results: list[dict] = []


def _write_review_file():
    """Write all collected results to a single timestamped review file."""
    if not _results:
        return
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = RESULTS_DIR / f"review_{ts}.md"

    lines = [
        "# Distillation Review",
        "",
        f"**Generated:** {datetime.now(timezone.utc).isoformat()}",
        "",
        "## Evaluation Criteria (test tree)",
        "",
        "```",
        EVALUATION_CRITERIA.rstrip(),
        "```",
        "",
    ]

    for r in _results:
        lines.extend([
            f"---",
            "",
            f"## {r['name']}",
            "",
            f"**Description:** {r['description']}",
            "",
            "### Input",
            "",
        ])
        for block in r["blocks"]:
            text = block["text"]
            if len(text) > 300:
                text = text[:300] + "..."
            lines.append(f"**[{block['type'].upper()}]** {text}")
            lines.append("")
        lines.extend([
            "### Output",
            "",
            f"> {r['output']}",
            "",
        ])

    path.write_text("\n".join(lines))
    return path


@pytest.mark.parametrize("case", CASES, ids=[c["name"] for c in CASES])
@pytest.mark.asyncio
async def test_distillation_quality(llm_client, case):
    """Run distillation and collect output for review."""
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

    # Mechanical checks only — quality is evaluated in review
    assert result, f"Distillation returned empty for case '{case['name']}'"
    assert any(
        result.lower().startswith(p) for p in ("i ", "i'")
    ), f"Expected first-person output, got: {result[:50]}..."

    _results.append({
        "name": case["name"],
        "description": case["description"],
        "blocks": case["blocks"],
        "output": result,
    })

    print(f"\n  [{case['name']}] {result}")


def test_write_review_file():
    """Write the collected results to a review file (runs last)."""
    path = _write_review_file()
    if path:
        print(f"\n  Review file: {path}")
