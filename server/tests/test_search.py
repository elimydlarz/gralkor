"""Tests for POST /search (edge-based hybrid search)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from .conftest import make_edge


@pytest.mark.asyncio
async def test_search_returns_facts(client, mock_graphiti):
    edges = [make_edge(uuid="e1", fact="Alice knows Bob")]
    mock_graphiti.search.return_value = edges

    resp = await client.post("/search", json={
        "query": "Alice",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert len(body["facts"]) == 1
    assert body["facts"][0]["uuid"] == "e1"
    assert body["facts"][0]["fact"] == "Alice knows Bob"
    assert body["nodes"] == []
    assert "episodes" not in body
    assert "communities" not in body


@pytest.mark.asyncio
async def test_search_forwards_params(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "test query",
        "group_ids": ["g1", "g2"],
        "num_results": 3,
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search.call_args.kwargs
    assert call_kwargs["query"] == "test query"
    assert call_kwargs["group_ids"] == ["g1", "g2"]
    assert call_kwargs["num_results"] == 3


@pytest.mark.asyncio
async def test_search_default_num_results(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "q",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search.call_args.kwargs
    assert call_kwargs["num_results"] == 10


@pytest.mark.asyncio
async def test_search_missing_query_returns_422(client):
    resp = await client.post("/search", json={
        "group_ids": ["g1"],
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_backend_error_propagates(client, mock_graphiti):
    """Backend errors propagate (ASGITransport raises instead of returning 500)."""
    mock_graphiti.search.side_effect = RuntimeError("LLM timeout")

    with pytest.raises(RuntimeError, match="LLM timeout"):
        await client.post("/search", json={
            "query": "test",
            "group_ids": ["g1"],
        })


@pytest.mark.asyncio
async def test_search_rate_limit_returns_429(client, mock_graphiti):
    """Upstream RateLimitError is returned as HTTP 429, not 500."""

    class RateLimitError(Exception):
        """Simulates openai.RateLimitError."""
        status_code = 429

    mock_graphiti.search.side_effect = RateLimitError("insufficient_quota")

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 429
    assert "insufficient_quota" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_search_wrapped_rate_limit_returns_429(client, mock_graphiti):
    """RateLimitError wrapped in another exception still returns 429."""

    class RateLimitError(Exception):
        status_code = 429

    cause = RateLimitError("quota exceeded")
    wrapper = RuntimeError("search failed")
    wrapper.__cause__ = cause
    mock_graphiti.search.side_effect = wrapper

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 429


@pytest.mark.asyncio
async def test_search_rate_limit_includes_retry_after_header(client, mock_graphiti):
    """429 response includes Retry-After header."""

    class RateLimitError(Exception):
        status_code = 429

    mock_graphiti.search.side_effect = RateLimitError("rate limited")

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 429
    assert "retry-after" in resp.headers
    # Should be a valid integer (seconds)
    assert int(resp.headers["retry-after"]) >= 0


@pytest.mark.asyncio
async def test_search_rate_limit_forwards_upstream_retry_after(client, mock_graphiti):
    """When upstream error has retry_after, it's forwarded in the header."""

    class RateLimitError(Exception):
        status_code = 429

        def __init__(self, msg, retry_after=None):
            super().__init__(msg)
            self.retry_after = retry_after

    mock_graphiti.search.side_effect = RateLimitError("rate limited", retry_after=30)

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 429
    assert resp.headers["retry-after"] == "30"


@pytest.mark.asyncio
async def test_search_returns_empty_results(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "nobody",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"facts": [], "nodes": []}


@pytest.mark.asyncio
async def test_search_fact_with_invalid_at_serializes_correctly(client, mock_graphiti):
    from datetime import datetime, timezone
    edge = make_edge(
        uuid="e-dated",
        invalid_at=datetime(2025, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    mock_graphiti.search.return_value = [edge]

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body["facts"][0]["invalid_at"] == "2025-06-01T12:00:00+00:00"


@pytest.mark.asyncio
async def test_search_fact_with_null_invalid_at(client, mock_graphiti):
    edge = make_edge(uuid="e-valid", invalid_at=None)
    mock_graphiti.search.return_value = [edge]

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body["facts"][0]["invalid_at"] is None


@pytest.mark.asyncio
async def test_search_sanitizes_backticks(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "tell me about ```json\n{}\n```",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search.call_args.kwargs
    assert "`" not in call_kwargs["query"]
    assert call_kwargs["query"] == "tell me about    json\n{}\n   "


@pytest.mark.asyncio
async def test_search_query_without_backticks_unchanged(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "plain query without special chars",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search.call_args.kwargs
    assert call_kwargs["query"] == "plain query without special chars"
