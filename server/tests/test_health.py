"""Tests for GET /health."""

import pytest
from unittest.mock import AsyncMock


@pytest.mark.asyncio
async def test_health_returns_ok(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_health_returns_graph_stats_when_connected(client, mock_graphiti):
    """When graphiti is initialized and FalkorDB is connected, returns graph stats."""
    mock_graphiti.driver.execute_query = AsyncMock(
        side_effect=[
            [[{"node_count": 42}]],   # node count query
            [[{"edge_count": 100}]],  # edge count query
        ]
    )
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["graph"]["connected"] is True
    assert data["graph"]["node_count"] == 42
    assert data["graph"]["edge_count"] == 100


@pytest.mark.asyncio
async def test_health_returns_graph_error_on_query_failure(client, mock_graphiti):
    """When graphiti is initialized but query fails, returns connected false."""
    mock_graphiti.driver.execute_query = AsyncMock(side_effect=Exception("connection refused"))
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["graph"]["connected"] is False
    assert "connection refused" in data["graph"]["error"]


@pytest.mark.asyncio
async def test_health_returns_graph_not_initialized(client):
    """When graphiti is not initialized, returns connected false."""
    import main as main_mod
    original = main_mod.graphiti
    main_mod.graphiti = None
    try:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["graph"]["connected"] is False
    finally:
        main_mod.graphiti = original
