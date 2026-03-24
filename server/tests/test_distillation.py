"""Unit tests for thinking distillation helpers."""

from __future__ import annotations

from main import _inject_action_summaries


class TestInjectActionSummaries:
    def test_single_turn(self):
        body = "User: Fix the bug\nAssistant: Fixed it!"
        result = _inject_action_summaries(body, ["Resolved the null pointer"])
        assert result == (
            "User: Fix the bug\n"
            "Assistant: (action: Resolved the null pointer)\n"
            "Assistant: Fixed it!"
        )

    def test_multi_turn(self):
        body = (
            "User: First question\n"
            "Assistant: First answer\n"
            "User: Second question\n"
            "Assistant: Second answer"
        )
        result = _inject_action_summaries(body, ["Did thing one", "Did thing two"])
        assert result == (
            "User: First question\n"
            "Assistant: (action: Did thing one)\n"
            "Assistant: First answer\n"
            "User: Second question\n"
            "Assistant: (action: Did thing two)\n"
            "Assistant: Second answer"
        )

    def test_empty_summary_skipped(self):
        body = "User: Hello\nAssistant: Hi"
        result = _inject_action_summaries(body, [""])
        assert result == body

    def test_no_summaries(self):
        body = "User: Hello\nAssistant: Hi"
        result = _inject_action_summaries(body, [])
        assert result == body

    def test_more_turns_than_summaries(self):
        body = (
            "User: First\n"
            "Assistant: A1\n"
            "User: Second\n"
            "Assistant: A2"
        )
        result = _inject_action_summaries(body, ["Only first"])
        assert result == (
            "User: First\n"
            "Assistant: (action: Only first)\n"
            "Assistant: A1\n"
            "User: Second\n"
            "Assistant: A2"
        )

    def test_multiple_assistant_lines_in_one_turn(self):
        body = (
            "User: Do something\n"
            "Assistant: Step 1\n"
            "Assistant: Step 2"
        )
        result = _inject_action_summaries(body, ["Did the thing"])
        assert result == (
            "User: Do something\n"
            "Assistant: (action: Did the thing)\n"
            "Assistant: Step 1\n"
            "Assistant: Step 2"
        )
