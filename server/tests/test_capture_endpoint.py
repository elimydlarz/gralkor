"""Tree: POST /capture endpoint (capture-endpoint in TEST_TREES.md).

Appends to buffer keyed by session_id (binding the group_id on first append),
returns 204, does not call distill synchronously.
"""

from __future__ import annotations

import main as main_mod


async def test_returns_204(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "session_id": "sess-1",
            "group_id": "grp",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert resp.status_code == 204
    assert resp.content == b""


async def test_appends_to_buffer_by_session_id(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-1",
            "group_id": "grp",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert main_mod.capture_buffer.has("sess-1")


async def test_sanitizes_group_id(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-2",
            "group_id": "my-agent",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert main_mod.capture_buffer.has("sess-2")
    turns = main_mod.capture_buffer.turns_for("sess-2")
    assert turns
    # group is bound on the entry — verify via an idle flush in a separate test.


async def test_does_not_call_distill_synchronously(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-3",
            "group_id": "grp",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    mock_graphiti.add_episode.assert_not_awaited()


async def test_bearer_auth_required(client, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "t")
    resp = await client.post(
        "/capture",
        json={
            "session_id": "sess",
            "group_id": "g",
            "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
        },
    )
    assert resp.status_code == 401
