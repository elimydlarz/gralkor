"""Tests for episode endpoints: POST /episodes, GET /episodes, DELETE /episodes/{uuid}."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import ANY

import pytest

from .conftest import make_episode


@pytest.mark.asyncio
async def test_add_episode_returns_serialized_episode(client, mock_graphiti):
    ep = make_episode(uuid="ep-42", name="chat", content="hi there", source_description="test", group_id="g1")
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "hi there",
        "source_description": "test",
        "group_id": "g1",
    })

    assert resp.status_code == 200
    body = resp.json()
    assert body["uuid"] == "ep-42"
    assert body["name"] == "chat"
    assert body["content"] == "hi there"
    assert body["group_id"] == "g1"
    assert body["source_description"] == "test"
    assert "created_at" in body

    mock_graphiti.add_episode.assert_called_once_with(
        name="chat",
        episode_body="hi there",
        source_description="test",
        group_id="g1",
        reference_time=ANY,
        source=ANY,
    )


@pytest.mark.asyncio
async def test_add_episode_uses_reference_time_when_provided(client, mock_graphiti):
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "body",
        "source_description": "src",
        "group_id": "g1",
        "reference_time": "2025-06-15T12:00:00+00:00",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["reference_time"] == datetime(2025, 6, 15, 12, 0, tzinfo=timezone.utc)


@pytest.mark.asyncio
async def test_add_episode_defaults_reference_time_to_utc_now(client, mock_graphiti):
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "body",
        "source_description": "src",
        "group_id": "g1",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    ref_time = call_kwargs["reference_time"]
    assert ref_time.tzinfo is not None  # timezone-aware
    # Should be very recent (within last 5 seconds)
    delta = (datetime.now(timezone.utc) - ref_time).total_seconds()
    assert 0 <= delta < 5


@pytest.mark.asyncio
async def test_add_episode_missing_required_field_returns_422(client):
    resp = await client.post("/episodes", json={
        "name": "chat",
        # episode_body missing
        "source_description": "src",
        "group_id": "g1",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_episodes_returns_list(client, mock_graphiti):
    episodes = [
        make_episode(uuid="ep-1", name="first"),
        make_episode(uuid="ep-2", name="second"),
    ]
    mock_graphiti.retrieve_episodes.return_value = episodes

    resp = await client.get("/episodes", params={"group_id": "g1", "limit": 5})

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert body[0]["uuid"] == "ep-1"
    assert body[1]["uuid"] == "ep-2"

    call_kwargs = mock_graphiti.retrieve_episodes.call_args.kwargs
    assert call_kwargs["last_n"] == 5
    assert call_kwargs["group_ids"] == ["g1"]


@pytest.mark.asyncio
async def test_get_episodes_default_limit(client, mock_graphiti):
    mock_graphiti.retrieve_episodes.return_value = []

    resp = await client.get("/episodes", params={"group_id": "g1"})

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.retrieve_episodes.call_args.kwargs
    assert call_kwargs["last_n"] == 10


@pytest.mark.asyncio
async def test_delete_episode_returns_204(client, mock_graphiti):
    resp = await client.delete("/episodes/ep-99")

    assert resp.status_code == 204
    mock_graphiti.remove_episode.assert_called_once_with("ep-99")
