"""Tests for graph operations: POST /build-indices, POST /build-communities."""

from __future__ import annotations

import pytest


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


@pytest.mark.asyncio
async def test_build_communities_missing_group_id_returns_422(client):
    resp = await client.post("/build-communities", json={})
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_build_indices_backend_error_propagates(client, mock_graphiti):
    mock_graphiti.build_indices_and_constraints.side_effect = RuntimeError("DB down")

    with pytest.raises(RuntimeError, match="DB down"):
        await client.post("/build-indices")


@pytest.mark.asyncio
async def test_build_communities_backend_error_propagates(client, mock_graphiti):
    mock_graphiti.build_communities.side_effect = RuntimeError("DB down")

    with pytest.raises(RuntimeError, match="DB down"):
        await client.post("/build-communities", json={"group_id": "g1"})
