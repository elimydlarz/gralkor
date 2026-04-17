"""Tree: formatting (Python port of src/tools.ts formatters).

Covers format_timestamp, format_fact, format_node used by /recall and /tools/memory_search.
"""

from __future__ import annotations

from pipelines.formatting import format_fact, format_facts, format_node, format_timestamp


class DescribeFormatTimestamp:
    def it_strips_fractional_seconds(self):
        assert format_timestamp("2026-04-17T12:00:00.123456+00:00") == "2026-04-17T12:00:00+0"

    def it_converts_z_suffix_to_plus_zero(self):
        assert format_timestamp("2026-04-17T12:00:00Z") == "2026-04-17T12:00:00+0"

    def it_keeps_nonzero_minute_offsets(self):
        assert format_timestamp("2026-04-17T12:00:00+05:30") == "2026-04-17T12:00:00+5:30"

    def it_compacts_zero_minute_offsets(self):
        assert format_timestamp("2026-04-17T12:00:00+05:00") == "2026-04-17T12:00:00+5"


class DescribeFormatFact:
    def it_includes_timestamps_when_present(self):
        fact = {
            "fact": "Alice knows Bob",
            "created_at": "2026-01-01T00:00:00+00:00",
            "valid_at": "2026-01-01T00:00:00+00:00",
        }
        result = format_fact(fact)
        assert "- Alice knows Bob" in result
        assert "created 2026-01-01T00:00:00+0" in result
        assert "valid from 2026-01-01T00:00:00+0" in result

    def it_omits_missing_timestamps(self):
        fact = {"fact": "Alice knows Bob"}
        assert format_fact(fact) == "- Alice knows Bob"

    def it_includes_invalid_and_expired(self):
        fact = {
            "fact": "Alice knows Bob",
            "invalid_at": "2026-06-01T00:00:00Z",
            "expired_at": "2026-12-01T00:00:00Z",
        }
        result = format_fact(fact)
        assert "invalid since 2026-06-01T00:00:00+0" in result
        assert "expired 2026-12-01T00:00:00+0" in result


class DescribeFormatFacts:
    def it_says_none_when_empty(self):
        assert format_facts([]) == "No graph facts found."

    def it_joins_with_facts_header(self):
        facts = [{"fact": "a"}, {"fact": "b"}]
        assert format_facts(facts) == "Facts:\n- a\n- b"


class DescribeFormatNode:
    def it_renders_name_and_summary(self):
        node = {"name": "Alice", "summary": "A person"}
        assert format_node(node) == "- Alice: A person"

    def it_falls_back_when_summary_is_missing(self):
        assert format_node({"name": "Alice"}) == "- Alice: (no summary)"

    def it_falls_back_when_summary_is_none(self):
        assert format_node({"name": "Alice", "summary": None}) == "- Alice: (no summary)"
