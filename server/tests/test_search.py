"""Tests for POST /search (combined hybrid search)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from .conftest import make_edge, make_entity, make_episode, make_community


@pytest.mark.asyncio
async def test_search_returns_combined_results(client, mock_graphiti):
    edges = [make_edge(uuid="e1", fact="Alice knows Bob")]
    nodes = [make_entity(uuid="n1", name="Alice")]
    episodes = [make_episode(uuid="ep1")]
    communities = [make_community(uuid="c1", name="People")]

    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=edges,
        nodes=nodes,
        episodes=episodes,
        communities=communities,
        edge_reranker_scores=[],
        node_reranker_scores=[],
        episode_reranker_scores=[],
        community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "Alice",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert "facts" in body
    assert "nodes" in body
    assert "episodes" in body
    assert "communities" in body
    assert len(body["facts"]) == 1
    assert body["facts"][0]["uuid"] == "e1"
    assert body["facts"][0]["fact"] == "Alice knows Bob"
    assert len(body["nodes"]) == 1
    assert body["nodes"][0]["uuid"] == "n1"
    assert len(body["episodes"]) == 1
    assert body["episodes"][0]["uuid"] == "ep1"
    assert len(body["communities"]) == 1
    assert body["communities"][0]["uuid"] == "c1"
    assert body["communities"][0]["name"] == "People"


@pytest.mark.asyncio
async def test_search_forwards_params(client, mock_graphiti):
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "test query",
        "group_ids": ["g1", "g2"],
        "num_results": 3,
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search_.call_args.kwargs
    assert call_kwargs["query"] == "test query"
    assert call_kwargs["group_ids"] == ["g1", "g2"]
    assert call_kwargs["config"].limit == 3


@pytest.mark.asyncio
async def test_search_default_num_results(client, mock_graphiti):
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "q",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search_.call_args.kwargs
    assert call_kwargs["config"].limit == 10


@pytest.mark.asyncio
async def test_search_does_not_mutate_global_config(client, mock_graphiti):
    """Ensure model_copy prevents mutation of the module-level COMBINED_HYBRID_SEARCH_RRF."""
    from graphiti_core.search.search_config_recipes import COMBINED_HYBRID_SEARCH_RRF

    original_limit = COMBINED_HYBRID_SEARCH_RRF.limit

    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    await client.post("/search", json={
        "query": "q",
        "group_ids": ["g1"],
        "num_results": 3,
    })

    assert COMBINED_HYBRID_SEARCH_RRF.limit == original_limit


@pytest.mark.asyncio
async def test_search_missing_query_returns_422(client):
    resp = await client.post("/search", json={
        "group_ids": ["g1"],
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_backend_error_propagates(client, mock_graphiti):
    """Backend errors propagate (ASGITransport raises instead of returning 500)."""
    mock_graphiti.search_.side_effect = RuntimeError("LLM timeout")

    with pytest.raises(RuntimeError, match="LLM timeout"):
        await client.post("/search", json={
            "query": "test",
            "group_ids": ["g1"],
        })


@pytest.mark.asyncio
async def test_search_returns_empty_results(client, mock_graphiti):
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "nobody",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body == {"facts": [], "nodes": [], "episodes": [], "communities": []}


@pytest.mark.asyncio
async def test_search_fact_with_invalid_at_serializes_correctly(client, mock_graphiti):
    from datetime import datetime, timezone
    edge = make_edge(
        uuid="e-dated",
        invalid_at=datetime(2025, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[edge], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

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
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[edge], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "test",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body["facts"][0]["invalid_at"] is None


@pytest.mark.asyncio
async def test_search_sanitizes_backticks(client, mock_graphiti):
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "tell me about ```json\n{}\n```",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search_.call_args.kwargs
    assert "`" not in call_kwargs["query"]
    assert call_kwargs["query"] == "tell me about    json\n{}\n   "


@pytest.mark.asyncio
async def test_search_query_without_backticks_unchanged(client, mock_graphiti):
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "plain query without special chars",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.search_.call_args.kwargs
    assert call_kwargs["query"] == "plain query without special chars"


@pytest.mark.asyncio
async def test_search_community_serialization(client, mock_graphiti):
    community = make_community(uuid="c1", name="AI Research", summary="Cluster of AI topics", group_id="grp-1")
    mock_graphiti.search_.return_value = SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[community],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )

    resp = await client.post("/search", json={
        "query": "AI",
        "group_ids": ["g1"],
    })

    assert resp.status_code == 200
    body = resp.json()
    c = body["communities"][0]
    assert c["uuid"] == "c1"
    assert c["name"] == "AI Research"
    assert c["summary"] == "Cluster of AI topics"
    assert c["group_id"] == "grp-1"
    assert "created_at" in c
