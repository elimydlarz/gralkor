"""Tests for graph operations: DELETE /edges, POST /clear, POST /build-indices, POST /build-communities."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.asyncio
async def test_delete_edge_returns_204(client, mock_graphiti):
    mock_edge = AsyncMock()
    mock_edge.delete = AsyncMock()

    with patch("main.EntityEdge") as MockEntityEdge:
        MockEntityEdge.get_by_uuid = AsyncMock(return_value=mock_edge)
        resp = await client.delete("/edges/edge-42")

    assert resp.status_code == 204
    MockEntityEdge.get_by_uuid.assert_called_once_with(mock_graphiti.driver, "edge-42")
    mock_edge.delete.assert_called_once_with(mock_graphiti.driver)


@pytest.mark.asyncio
async def test_clear_graph_returns_deleted_true(client, mock_graphiti):
    with patch("main.Node") as MockNode:
        MockNode.delete_by_group_id = AsyncMock()
        resp = await client.post("/clear", json={"group_id": "g1"})

    assert resp.status_code == 200
    assert resp.json() == {"deleted": True}
    MockNode.delete_by_group_id.assert_called_once_with(mock_graphiti.driver, "g1")


@pytest.mark.asyncio
async def test_build_indices_returns_ok(client, mock_graphiti):
    resp = await client.post("/build-indices")

    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}
    mock_graphiti.build_indices_and_constraints.assert_called_once()


@pytest.mark.asyncio
async def test_build_communities_returns_counts(client, mock_graphiti):
    mock_graphiti.build_communities.return_value = (
        ["c1", "c2", "c3"],
        ["e1", "e2"],
    )

    resp = await client.post("/build-communities", json={"group_id": "g1"})

    assert resp.status_code == 200
    assert resp.json() == {"communities": 3, "edges": 2}
    call_kwargs = mock_graphiti.build_communities.call_args.kwargs
    assert call_kwargs["group_ids"] == ["g1"]
