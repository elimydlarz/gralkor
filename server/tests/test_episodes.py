"""Tests for episode endpoint: POST /episodes."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import ANY

import pytest
from pydantic import BaseModel

import main as main_mod
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
        "idempotency_key": "test-key",
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
        entity_types=None,
        edge_types=None,
        edge_type_map=None,
        excluded_entity_types=None,
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
        "idempotency_key": "test-key",
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
        "idempotency_key": "test-key",
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
        "idempotency_key": "test-key",
    })
    assert resp.status_code == 422



@pytest.mark.asyncio
async def test_add_episode_defaults_to_message_type(client, mock_graphiti):
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "body",
        "source_description": "src",
        "group_id": "g1",
        "idempotency_key": "test-key",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["source"].value == "message" or str(call_kwargs["source"]) == "EpisodeType.message"


@pytest.mark.asyncio
async def test_add_episode_accepts_text_source_type(client, mock_graphiti):
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "note",
        "episode_body": "A reflection",
        "source_description": "manual memory_store",
        "group_id": "g1",
        "source": "text",
        "idempotency_key": "test-key",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["source"].value == "text" or str(call_kwargs["source"]) == "EpisodeType.text"


@pytest.mark.asyncio
async def test_add_episode_backend_error_propagates(client, mock_graphiti):
    """Backend errors propagate (ASGITransport raises instead of returning 500)."""
    mock_graphiti.add_episode.side_effect = RuntimeError("FalkorDB connection lost")

    with pytest.raises(RuntimeError, match="FalkorDB connection lost"):
        await client.post("/episodes", json={
            "name": "chat",
            "episode_body": "body",
            "source_description": "src",
            "group_id": "g1",
            "idempotency_key": "test-key",
        })



@pytest.mark.asyncio
async def test_add_episode_rate_limit_returns_429(client, mock_graphiti):
    """Upstream RateLimitError during episode ingestion returns HTTP 429."""

    class RateLimitError(Exception):
        status_code = 429

    mock_graphiti.add_episode.side_effect = RateLimitError("insufficient_quota")

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "body",
        "source_description": "src",
        "group_id": "g1",
        "idempotency_key": "test-key",
    })

    assert resp.status_code == 429
    assert "insufficient_quota" in resp.json()["detail"]



@pytest.mark.asyncio
async def test_add_episode_passes_ontology_when_configured(client, mock_graphiti):
    """When ontology globals are set, they are forwarded to add_episode."""

    class FakeEntity(BaseModel):
        role: str

    try:
        main_mod.ontology_entity_types = {"Person": FakeEntity}
        main_mod.ontology_edge_types = None
        main_mod.ontology_edge_type_map = {("Person", "Project"): ["WorksOn"]}

        ep = make_episode()
        mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

        resp = await client.post("/episodes", json={
            "name": "chat",
            "episode_body": "body",
            "source_description": "src",
            "group_id": "g1",
            "idempotency_key": "test-key",
        })

        assert resp.status_code == 200
        call_kwargs = mock_graphiti.add_episode.call_args.kwargs
        assert call_kwargs["entity_types"] == {"Person": FakeEntity}
        assert call_kwargs["edge_types"] is None
        assert call_kwargs["edge_type_map"] == {("Person", "Project"): ["WorksOn"]}
        assert call_kwargs["excluded_entity_types"] == ["Generic"]
    finally:
        main_mod.ontology_entity_types = None
        main_mod.ontology_edge_types = None
        main_mod.ontology_edge_type_map = None
        main_mod.ontology_excluded = None
