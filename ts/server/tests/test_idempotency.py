"""Tests for idempotency key support on episode creation endpoints."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

import main as main_mod
from .conftest import make_episode


@pytest.fixture(autouse=True)
def _clear_idempotency_store():
    """Ensure idempotency store is empty before each test."""
    main_mod._idempotency_store.clear()


# ── /episodes ────────────────────────────────────────────────


class TestEpisodesIdempotency:
    """Idempotency on POST /episodes."""

    @pytest.mark.asyncio
    async def test_new_key_calls_graphiti(self, client, mock_graphiti):
        """when idempotency_key is new then calls graphiti add_episode"""
        ep = make_episode(uuid="ep-new")
        mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

        resp = await client.post("/episodes", json={
            "name": "test",
            "episode_body": "body",
            "source_description": "src",
            "group_id": "g1",
            "idempotency_key": "key-1",
        })

        assert resp.status_code == 200
        assert resp.json()["uuid"] == "ep-new"
        mock_graphiti.add_episode.assert_called_once()

    @pytest.mark.asyncio
    async def test_duplicate_key_returns_cached(self, client, mock_graphiti):
        """when idempotency_key was already processed then returns cached episode"""
        ep = make_episode(uuid="ep-cached")
        mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

        payload = {
            "name": "test",
            "episode_body": "body",
            "source_description": "src",
            "group_id": "g1",
            "idempotency_key": "key-dup",
        }
        resp1 = await client.post("/episodes", json=payload)
        resp2 = await client.post("/episodes", json=payload)

        assert resp1.json() == resp2.json()

    @pytest.mark.asyncio
    async def test_duplicate_key_does_not_call_graphiti_again(self, client, mock_graphiti):
        """when idempotency_key was already processed then does not call graphiti add_episode"""
        ep = make_episode(uuid="ep-once")
        mock_graphiti.add_episode.return_value = SimpleNamespace(episode=ep)

        payload = {
            "name": "test",
            "episode_body": "body",
            "source_description": "src",
            "group_id": "g1",
            "idempotency_key": "key-once",
        }
        await client.post("/episodes", json=payload)
        await client.post("/episodes", json=payload)

        mock_graphiti.add_episode.assert_called_once()
