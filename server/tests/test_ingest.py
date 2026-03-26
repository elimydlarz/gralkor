"""Tests for POST /openclaw-messages endpoint (structured message ingestion with thinking distillation)."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from .conftest import make_episode


@pytest.mark.asyncio
async def test_ingest_formats_transcript_and_creates_episode(client, mock_graphiti):
    """Structured messages are formatted into a transcript and ingested as an episode."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/ingest-messages", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "Fix the bug"}]},
            {"role": "assistant", "content": [{"type": "text", "text": "Fixed it!"}]},
        ],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert "User: Fix the bug" in call_kwargs["episode_body"]
    assert "Assistant: Fixed it!" in call_kwargs["episode_body"]


@pytest.mark.asyncio
async def test_ingest_distills_thinking_into_behaviour(client, mock_graphiti):
    """Thinking blocks are distilled into behaviour summaries via LLM."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)
    mock_graphiti.llm_client.generate_response.return_value = {
        "content": "Investigated and resolved the null pointer issue"
    }

    resp = await client.post("/ingest-messages", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "Fix the bug"}]},
            {"role": "assistant", "content": [
                {"type": "thinking", "text": "Let me search for the auth file..."},
                {"type": "text", "text": "Fixed it!"},
            ]},
        ],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    body = call_kwargs["episode_body"]
    assert "Assistant: (behaviour: Investigated and resolved the null pointer issue)" in body
    assert "Assistant: Fixed it!" in body
    mock_graphiti.llm_client.generate_response.assert_called_once()


@pytest.mark.asyncio
async def test_ingest_distillation_failure_drops_action(client, mock_graphiti):
    """If distillation fails, episode is still created without action line."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)
    mock_graphiti.llm_client.generate_response.side_effect = RuntimeError("LLM unavailable")

    resp = await client.post("/ingest-messages", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "Fix the bug"}]},
            {"role": "assistant", "content": [
                {"type": "thinking", "text": "Some thinking..."},
                {"type": "text", "text": "Fixed it!"},
            ]},
        ],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert "(action:" not in call_kwargs["episode_body"]


@pytest.mark.asyncio
async def test_ingest_no_thinking_skips_distillation(client, mock_graphiti):
    """Messages without thinking blocks skip LLM distillation."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/ingest-messages", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "messages": [
            {"role": "user", "content": [{"type": "text", "text": "Hello"}]},
            {"role": "assistant", "content": [{"type": "text", "text": "Hi"}]},
        ],
    })

    assert resp.status_code == 200
    mock_graphiti.llm_client.generate_response.assert_not_called()


@pytest.mark.asyncio
async def test_ingest_missing_required_field_returns_422(client):
    """Missing required fields return 422."""
    resp = await client.post("/ingest-messages", json={
        "name": "chat",
        # messages missing
        "source_description": "auto-capture",
        "group_id": "g1",
    })
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_ingest_empty_messages_creates_empty_episode(client, mock_graphiti):
    """Empty messages array produces empty episode body."""
    ep = make_episode()
    mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

    resp = await client.post("/ingest-messages", json={
        "name": "chat",
        "source_description": "auto-capture",
        "group_id": "g1",
        "messages": [],
    })

    assert resp.status_code == 200
    call_kwargs = mock_graphiti.add_episode.call_args.kwargs
    assert call_kwargs["episode_body"] == ""
