"""Tree: POST /capture endpoint (capture-endpoint in TEST_TREES.md).

Appends to buffer, returns 204, does not call distill synchronously.
"""

from __future__ import annotations

import asyncio

import main as main_mod


async def test_returns_204(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "group_id": "grp",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert resp.status_code == 204
    assert resp.content == b""


async def test_appends_to_buffer(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "group_id": "grp",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert main_mod.capture_buffer.has("grp")


async def test_sanitizes_group_id(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "group_id": "my-agent",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert main_mod.capture_buffer.has("my_agent")
    assert not main_mod.capture_buffer.has("my-agent")


async def test_does_not_call_distill_synchronously(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "group_id": "grp",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    mock_graphiti.add_episode.assert_not_awaited()


async def test_bearer_auth_required(client, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "t")
    resp = await client.post(
        "/capture",
        json={"group_id": "g", "turn": {"user_query": "q", "events": [], "assistant_answer": "a"}},
    )
    assert resp.status_code == 401
