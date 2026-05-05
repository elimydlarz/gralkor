"""Tests for POST /episodes endpoint (pre-formatted episode_body ingestion)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from .conftest import make_episode


@pytest.mark.asyncio
async def test_ingest_episode_body_passes_through_to_graphiti(client, mock_graphiti):
    """episode_body is passed directly to graphiti.add_episode without modification."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    body = "User: Fix the bug\nAssistant: Fixed it!"
    resp = await client.post("/episodes", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "episode_body": body,
        "source": "message",
        "idempotency_key": "test-key-1",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["episode_body"] == body


@pytest.mark.asyncio
async def test_ingest_episode_with_behaviour_summary(client, mock_graphiti):
    """Pre-distilled behaviour summary in episode_body is preserved verbatim."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    body = (
        "User: Fix the bug\n"
        "Assistant: (behaviour: Investigated and resolved the null pointer issue)\n"
        "Assistant: Fixed it!"
    )
    resp = await client.post("/episodes", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "episode_body": body,
        "source": "message",
        "idempotency_key": "test-key-2",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert "(behaviour: Investigated and resolved the null pointer issue)" in call_kwargs["episode_body"]


@pytest.mark.asyncio
async def test_ingest_episode_missing_required_field_returns_422(client):
    """Missing required fields return 422."""
    resp = await client.post("/episodes", json={
        "name": "chat",
        # episode_body missing
        "source_description": "auto-capture",
        "group_id": "g1",
        "idempotency_key": "test-key-3",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ingest_episode_idempotency(client, mock_graphiti):
    """Duplicate idempotency_key returns the cached episode without re-calling graphiti."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    payload = {
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "episode_body": "User: Hello\nAssistant: Hi",
        "source": "message",
        "idempotency_key": "dupe-key",
    }
    resp1 = await client.post("/episodes", json=payload)
    resp2 = await client.post("/episodes", json=payload)

    assert resp1.status_code == 200
    assert resp2.status_code == 200
    assert mock_graphiti.add_episode.call_count == 1


@pytest.mark.asyncio
async def test_ingest_episode_does_not_call_llm_client(client, mock_graphiti):
    """Server no longer calls llm_client — distillation is done plugin-side."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "episode_body": "User: Fix it\nAssistant: (behaviour: Searched codebase)\nAssistant: Done",
        "source": "message",
        "idempotency_key": "test-key-5",
    })

    assert resp.status_code == 200
    mock_graphiti.llm_client.generate_response.assert_not_called()


@pytest.mark.asyncio
async def test_ingest_episode_group_id_passed_to_graphiti(client, mock_graphiti):
    """group_id is forwarded to graphiti.add_episode."""
    ep = make_episode(group_id="my_agent")
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/episodes", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "my_agent",
        "episode_body": "User: Hello",
        "source": "message",
        "idempotency_key": "test-key-6",
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["group_id"] == "my_agent"
