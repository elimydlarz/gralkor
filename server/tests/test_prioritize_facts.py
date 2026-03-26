"""Tests for _prioritize_facts — reserved-slot fact prioritization."""

from __future__ import annotations

from datetime import datetime, timezone

import pytest

from .conftest import make_edge


# Import the function under test
from main import _prioritize_facts


def _valid_edge(uuid: str, **kw):
    return make_edge(uuid=uuid, invalid_at=None, expired_at=None, **kw)


def _invalid_edge(uuid: str, **kw):
    return make_edge(uuid=uuid, invalid_at=datetime(2025, 6, 1, tzinfo=timezone.utc), expired_at=None, **kw)


def _expired_edge(uuid: str, **kw):
    """Superseded: both invalid and expired."""
    return make_edge(
        uuid=uuid,
        invalid_at=datetime(2025, 5, 1, tzinfo=timezone.utc),
        expired_at=datetime(2025, 6, 1, tzinfo=timezone.utc),
        **kw,
    )


class TestAllValid:
    """when all facts are valid (no invalid_at)"""

    def test_returns_all_up_to_limit(self):
        edges = [_valid_edge(f"v{i}") for i in range(5)]
        result = _prioritize_facts(edges, limit=10)
        assert len(result) == 5
        assert all(e.invalid_at is None for e in result)

    def test_preserves_relevance_order(self):
        edges = [_valid_edge(f"v{i}") for i in range(5)]
        result = _prioritize_facts(edges, limit=10)
        assert [e.uuid for e in result] == [f"v{i}" for i in range(5)]

    def test_caps_at_limit(self):
        edges = [_valid_edge(f"v{i}") for i in range(15)]
        result = _prioritize_facts(edges, limit=10)
        assert len(result) == 10


class TestMixedValidAndInvalid:
    """when mix of valid and invalid facts"""

    def test_reserved_slots_filled_with_valid_first(self):
        # 5 valid, 5 invalid, limit=10 → reserved=7
        edges = [
            _invalid_edge("i0"),
            _valid_edge("v0"),
            _invalid_edge("i1"),
            _valid_edge("v1"),
            _invalid_edge("i2"),
            _valid_edge("v2"),
            _invalid_edge("i3"),
            _valid_edge("v3"),
            _invalid_edge("i4"),
            _valid_edge("v4"),
        ]
        result = _prioritize_facts(edges, limit=10)
        # First 5 should be valid (all available valid facts fill reserved slots)
        assert all(e.invalid_at is None for e in result[:5])

    def test_remaining_slots_preserve_relevance_order(self):
        # 3 valid, 7 invalid interleaved, limit=10, reserved=7
        edges = [
            _invalid_edge("i0"),  # relevance rank 0
            _valid_edge("v0"),    # relevance rank 1
            _invalid_edge("i1"),  # relevance rank 2
            _valid_edge("v1"),    # relevance rank 3
            _invalid_edge("i2"),  # relevance rank 4
            _valid_edge("v2"),    # relevance rank 5
            _invalid_edge("i3"),  # relevance rank 6
            _invalid_edge("i4"),  # relevance rank 7
            _invalid_edge("i5"),  # relevance rank 8
            _invalid_edge("i6"),  # relevance rank 9
        ]
        result = _prioritize_facts(edges, limit=10)
        # Reserved: v0, v1, v2 (only 3 valid, fills 3 of 7 reserved)
        # Remainder: 7 slots left, filled by relevance from leftovers
        # Leftovers in original order: i0, i1, i2, i3, i4, i5, i6
        assert [e.uuid for e in result] == ["v0", "v1", "v2", "i0", "i1", "i2", "i3", "i4", "i5", "i6"]

    def test_total_never_exceeds_limit(self):
        edges = [_valid_edge(f"v{i}") for i in range(10)] + [_invalid_edge(f"i{i}") for i in range(10)]
        result = _prioritize_facts(edges, limit=10)
        assert len(result) == 10


class TestFewerValidThanReserved:
    """when fewer valid facts than reserved slots"""

    def test_all_valid_placed_first(self):
        edges = [_valid_edge("v0"), _invalid_edge("i0"), _invalid_edge("i1"), _invalid_edge("i2")]
        result = _prioritize_facts(edges, limit=4)
        assert result[0].uuid == "v0"
        assert result[0].invalid_at is None

    def test_remaining_filled_with_non_valid(self):
        edges = [_valid_edge("v0"), _invalid_edge("i0"), _invalid_edge("i1"), _invalid_edge("i2")]
        result = _prioritize_facts(edges, limit=4)
        assert len(result) == 4


class TestAllInvalid:
    """when all facts are invalid"""

    def test_returns_invalid_up_to_limit(self):
        edges = [_invalid_edge(f"i{i}") for i in range(5)]
        result = _prioritize_facts(edges, limit=10)
        assert len(result) == 5

    def test_no_empty_results(self):
        edges = [_invalid_edge("i0")]
        result = _prioritize_facts(edges, limit=10)
        assert len(result) == 1


class TestExpiredFacts:
    """when invalid_at is set but expired_at is also set (superseded)"""

    def test_treated_same_as_invalid(self):
        # Expired facts have invalid_at set — they go to non-reserved slots
        edges = [_expired_edge("x0"), _valid_edge("v0")]
        result = _prioritize_facts(edges, limit=2)
        # Valid first in reserved, expired fills remainder
        assert result[0].uuid == "v0"
        assert result[1].uuid == "x0"


class TestOverFetchDisplacement:
    """when more candidates than limit (over-fetch scenario)"""

    def test_valid_from_beyond_original_limit_displaces_invalid(self):
        # Simulates 2x over-fetch: 20 results, limit=10
        # First 10 from Graphiti: 3 valid + 7 invalid
        # Next 10: 5 valid + 5 invalid
        edges = (
            [_valid_edge(f"v{i}") for i in range(3)]
            + [_invalid_edge(f"i{i}") for i in range(7)]
            + [_valid_edge(f"v{i}") for i in range(3, 8)]
            + [_invalid_edge(f"i{i}") for i in range(7, 12)]
        )
        result = _prioritize_facts(edges, limit=10)
        # 7 reserved slots, 8 valid facts available → 7 valid in reserved
        # 3 open slots filled by relevance from leftovers
        valid_in_result = [e for e in result if e.invalid_at is None]
        assert len(valid_in_result) >= 7


class TestSearchEndpointOverFetch:
    """Search endpoint over-fetches and applies prioritization."""

    @pytest.mark.asyncio
    async def test_over_fetches_2x(self, client, mock_graphiti):
        mock_graphiti.search.return_value = []
        await client.post("/search", json={
            "query": "test",
            "group_ids": ["g1"],
            "num_results": 5,
        })
        call_kwargs = mock_graphiti.search.call_args.kwargs
        assert call_kwargs["num_results"] == 10  # 2x over-fetch

    @pytest.mark.asyncio
    async def test_returns_prioritized_facts(self, client, mock_graphiti):
        mock_graphiti.search.return_value = [
            _invalid_edge("i0"),
            _valid_edge("v0"),
            _invalid_edge("i1"),
            _valid_edge("v1"),
        ]
        resp = await client.post("/search", json={
            "query": "test",
            "group_ids": ["g1"],
            "num_results": 3,
        })
        body = resp.json()
        # Reserved slots (round(3*0.7)=2) filled with valid first
        assert body["facts"][0]["uuid"] == "v0"
        assert body["facts"][1]["uuid"] == "v1"
        assert len(body["facts"]) == 3
