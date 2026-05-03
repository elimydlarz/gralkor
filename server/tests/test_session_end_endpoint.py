"""Tree: POST /session_end endpoint (in TEST_TREES.md).

Flushes a session's buffered turns via the registered callback and retry
machinery. Returns 204 without awaiting flush completion.
"""

from __future__ import annotations

import logging

import main as main_mod


async def test_returns_204_for_session_with_buffered_turns(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-end-1",
            "group_id": "grp",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
        },
    )
    assert main_mod.capture_buffer.has("sess-end-1")

    resp = await client.post("/session_end", json={"session_id": "sess-end-1"})

    assert resp.status_code == 204
    assert resp.content == b""


async def test_removes_entry_from_buffer(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-end-2",
            "group_id": "grp",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
        },
    )
    await client.post("/session_end", json={"session_id": "sess-end-2"})
    assert not main_mod.capture_buffer.has("sess-end-2")


async def test_returns_204_for_unknown_session(client, mock_graphiti):
    resp = await client.post("/session_end", json={"session_id": "never-captured"})
    assert resp.status_code == 204


async def test_rejects_blank_session_id(client, mock_graphiti):
    resp = await client.post("/session_end", json={"session_id": ""})
    assert resp.status_code == 422


async def test_rejects_missing_session_id(client, mock_graphiti):
    resp = await client.post("/session_end", json={})
    assert resp.status_code == 422


async def test_logs_session_end_at_info(client, mock_graphiti, caplog):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-log",
            "group_id": "grp",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
        },
    )
    caplog.set_level(logging.INFO, logger="main")
    await client.post("/session_end", json={"session_id": "sess-log"})
    info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    assert any(
        "[gralkor] session_end" in m and "session:sess-log" in m and "turns:1" in m
        for m in info_msgs
    ), info_msgs
