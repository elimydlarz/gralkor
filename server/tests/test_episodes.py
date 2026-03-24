"""Tests for episode endpoints: POST /episodes, GET /episodes, DELETE /episodes/{uuid}."""

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
async def test_get_episodes_missing_group_id_returns_422(client):
    resp = await client.get("/episodes")
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
        })


@pytest.mark.asyncio
async def test_get_episodes_backend_error_propagates(client, mock_graphiti):
    mock_graphiti.retrieve_episodes.side_effect = RuntimeError("timeout")

    with pytest.raises(RuntimeError, match="timeout"):
        await client.get("/episodes", params={"group_id": "g1"})


@pytest.mark.asyncio
async def test_delete_episode_returns_204(client, mock_graphiti):
    resp = await client.delete("/episodes/ep-99")

    assert resp.status_code == 204
    mock_graphiti.remove_episode.assert_called_once_with("ep-99")


@pytest.mark.asyncio
async def test_delete_episode_backend_error_propagates(client, mock_graphiti):
    mock_graphiti.remove_episode.side_effect = RuntimeError("not found")

    with pytest.raises(RuntimeError, match="not found"):
        await client.delete("/episodes/ep-99")


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
    })

    assert resp.status_code == 429
    assert "insufficient_quota" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_add_episode_with_thinking_blocks_injects_action_lines(client, mock_graphiti):
    """When thinking_blocks are provided, distill and inject action summaries."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)
    mock_graphiti.llm_client.generate_response.return_value = {
        "content": "Investigated and resolved the null pointer issue"
    }

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "User: Fix the bug\nAssistant: Fixed it!",
        "source_description": "auto-capture",
        "group_id": "g1",
        "thinking_blocks": ["Let me search for the auth file and read it..."],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    body = call_kwargs["episode_body"]
    assert "Assistant: (action: Investigated and resolved the null pointer issue)" in body
    assert "Assistant: Fixed it!" in body
    mock_graphiti.llm_client.generate_response.assert_called_once()


@pytest.mark.asyncio
async def test_add_episode_without_thinking_blocks_unchanged(client, mock_graphiti):
    """Without thinking_blocks, episode body passes through unmodified."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    original_body = "User: Hello\nAssistant: Hi"
    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": original_body,
        "source_description": "src",
        "group_id": "g1",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["episode_body"] == original_body
    mock_graphiti.llm_client.generate_response.assert_not_called()


@pytest.mark.asyncio
async def test_add_episode_distillation_failure_drops_action(client, mock_graphiti):
    """If distillation fails, episode is still created without action line."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)
    mock_graphiti.llm_client.generate_response.side_effect = RuntimeError("LLM unavailable")

    resp = await client.post("/episodes", json={
        "name": "chat",
        "episode_body": "User: Fix the bug\nAssistant: Fixed it!",
        "source_description": "auto-capture",
        "group_id": "g1",
        "thinking_blocks": ["Some thinking..."],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert "(action:" not in call_kwargs["episode_body"]


@pytest.mark.asyncio
async def test_add_episode_passes_ontology_when_configured(client, mock_graphiti):
    """When ontology globals are set, they are forwarded to add_episode."""

    class FakeEntity(BaseModel):
        role: str

    try:
        main_mod.ontology_entity_types = {"Person": FakeEntity}
        main_mod.ontology_edge_types = None
        main_mod.ontology_edge_type_map = {("Person", "Project"): ["WorksOn"]}
        main_mod.ontology_excluded = ["Generic"]

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
        assert call_kwargs["entity_types"] == {"Person": FakeEntity}
        assert call_kwargs["edge_types"] is None
        assert call_kwargs["edge_type_map"] == {("Person", "Project"): ["WorksOn"]}
        assert call_kwargs["excluded_entity_types"] == ["Generic"]
    finally:
        main_mod.ontology_entity_types = None
        main_mod.ontology_edge_types = None
        main_mod.ontology_edge_type_map = None
        main_mod.ontology_excluded = None
