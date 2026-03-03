"""Tests for search endpoints: POST /search, POST /search/nodes."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from .conftest import make_edge, make_entity


@pytest.mark.asyncio
async def test_search_facts_returns_serialized_edges(client, mock_graphiti):
    edges = [
        make_edge(uuid="e1", name="KNOWS", fact="Alice knows Bob"),
        make_edge(uuid="e2", name="LIKES", fact="Alice likes cats"),
    ]
    mock_graphiti.search.return_value = edges

    resp = await client.post("/search", json={
        "query": "Alice",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["uuid"] == "e1"
    assert body[0]["fact"] == "Alice knows Bob"
    assert body[0]["group_id"] == "grp-1"
    assert body[1]["uuid"] == "e2"
    assert "valid_at" in body[0]
    assert "created_at" in body[0]


@pytest.mark.asyncio
async def test_search_facts_forwards_params(client, mock_graphiti):
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
async def test_search_facts_default_num_results(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "q",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search.call_args.kwargs
    assert call_kwargs["num_results"] == 10


@pytest.mark.asyncio
async def test_search_nodes_returns_serialized_nodes(client, mock_graphiti):
    nodes = [make_entity(uuid="n1", name="Alice"), make_entity(uuid="n2", name="Bob")]
    mock_graphiti.search_.return_value = SimpleNamespace(nodes=nodes)

    resp = await client.post("/search/nodes", json={
        "query": "people",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["uuid"] == "n1"
    assert body[0]["name"] == "Alice"
    assert body[1]["uuid"] == "n2"
    assert "summary" in body[0]
    assert "group_id" in body[0]


@pytest.mark.asyncio
async def test_search_nodes_truncates_to_num_results(client, mock_graphiti):
    nodes = [make_entity(uuid=f"n{i}") for i in range(10)]
    mock_graphiti.search_.return_value = SimpleNamespace(nodes=nodes)

    resp = await client.post("/search/nodes", json={
        "query": "people",
        "group_ids": ["g1"],
        "num_results": 3,
    })

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 3


@pytest.mark.asyncio
async def test_search_missing_query_returns_422(client):
    resp = await client.post("/search", json={
        "group_ids": ["g1"],
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_nodes_missing_query_returns_422(client):
    resp = await client.post("/search/nodes", json={
        "group_ids": ["g1"],
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_facts_backend_error_propagates(client, mock_graphiti):
    """Backend errors propagate (ASGITransport raises instead of returning 500)."""
    mock_graphiti.search.side_effect = RuntimeError("LLM timeout")

    with pytest.raises(RuntimeError, match="LLM timeout"):
        await client.post("/search", json={
            "query": "test",
            "group_ids": ["g1"],
        })


@pytest.mark.asyncio
async def test_search_nodes_backend_error_propagates(client, mock_graphiti):
    mock_graphiti.search_.side_effect = RuntimeError("LLM timeout")

    with pytest.raises(RuntimeError, match="LLM timeout"):
        await client.post("/search/nodes", json={
            "query": "test",
            "group_ids": ["g1"],
        })


@pytest.mark.asyncio
async def test_search_nodes_returns_empty_list(client, mock_graphiti):
    mock_graphiti.search_.return_value = SimpleNamespace(nodes=[])

    resp = await client.post("/search/nodes", json={
        "query": "nobody",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_search_facts_with_invalid_at_serializes_correctly(client, mock_graphiti):
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
    assert body[0]["invalid_at"] == "2025-06-01T12:00:00+00:00"


@pytest.mark.asyncio
async def test_search_facts_with_null_invalid_at(client, mock_graphiti):
    edge = make_edge(uuid="e-valid", invalid_at=None)
    mock_graphiti.search.return_value = [edge]

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["invalid_at"] is None


@pytest.mark.asyncio
async def test_search_facts_sanitizes_backticks(client, mock_graphiti):
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
async def test_search_nodes_sanitizes_backticks(client, mock_graphiti):
    from types import SimpleNamespace
    mock_graphiti.search_.return_value = SimpleNamespace(nodes=[])

    resp = await client.post("/search/nodes", json={
        "query": "what is `foo`?",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search_.call_args.kwargs
    assert "`" not in call_kwargs["query"]
    assert call_kwargs["query"] == "what is  foo ?"


@pytest.mark.asyncio
async def test_search_facts_query_without_backticks_unchanged(client, mock_graphiti):
    mock_graphiti.search.return_value = []

    resp = await client.post("/search", json={
        "query": "plain query without special chars",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search.call_args.kwargs
    assert call_kwargs["query"] == "plain query without special chars"


@pytest.mark.asyncio
async def test_search_nodes_asserts_values(client, mock_graphiti):
    nodes = [make_entity(uuid="n1", name="Alice", summary="A person", group_id="grp-1")]
    mock_graphiti.search_.return_value = SimpleNamespace(nodes=nodes)

    resp = await client.post("/search/nodes", json={
        "query": "people",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["summary"] == "A person"
    assert body[0]["group_id"] == "grp-1"
    assert body[0]["name"] == "Alice"
