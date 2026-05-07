"""Tree: POST /capture endpoint.

Appends a turn (list of canonical Messages) to the buffer keyed by session_id
(binding the group_id on first append), returns 204, does not call distill
synchronously.
"""

from __future__ import annotations

import logging

import main as main_mod


async def test_rejects_blank_session_id(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "session_id": "",
            "group_id": "grp",
            "agent_name": "TestAgent",
            "messages": [{"role": "user", "content": "q"}],
        },
    )
    assert resp.status_code == 422


async def test_rejects_missing_session_id(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "group_id": "grp",
            "agent_name": "TestAgent",
            "messages": [{"role": "user", "content": "q"}],
        },
    )
    assert resp.status_code == 422


async def test_returns_204(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "session_id": "sess-1",
            "group_id": "grp",
            "agent_name": "TestAgent",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
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
            "agent_name": "TestAgent",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
        },
    )
    assert main_mod.capture_buffer.has("sess-1")


async def test_sanitizes_group_id(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-2",
            "group_id": "my-agent",
            "agent_name": "TestAgent",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
        },
    )
    assert main_mod.capture_buffer.has("sess-2")
    turns = main_mod.capture_buffer.turns_for("sess-2")
    assert turns


async def test_does_not_call_distill_synchronously(client, mock_graphiti):
    await client.post(
        "/capture",
        json={
            "session_id": "sess-3",
            "group_id": "grp",
            "agent_name": "TestAgent",
            "messages": [
                {"role": "user", "content": "q"},
                {"role": "assistant", "content": "a"},
            ],
        },
    )
    mock_graphiti.add_episode.assert_not_awaited()


class TestObservability:
    async def test_does_not_log_turn_content_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        await client.post(
            "/capture",
            json={
                "session_id": "s",
                "group_id": "g",
                "agent_name": "TestAgent",
                "messages": [
                    {"role": "user", "content": "sensitive question"},
                    {"role": "assistant", "content": "secret answer"},
                ],
            },
        )
        info_msgs = "\n".join(r.getMessage() for r in caplog.records if r.levelno == logging.INFO)
        assert "sensitive question" not in info_msgs
        assert "secret answer" not in info_msgs

    async def test_logs_messages_at_debug(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        await client.post(
            "/capture",
            json={
                "session_id": "s",
                "group_id": "g",
                "agent_name": "TestAgent",
                "messages": [
                    {"role": "user", "content": "sensitive question"},
                    {"role": "behaviour", "content": "thought: considering"},
                    {"role": "assistant", "content": "secret answer"},
                ],
            },
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any(
            "[gralkor] [test] capture messages:" in m
            and "sensitive question" in m
            and "thought: considering" in m
            and "secret answer" in m
            for m in debug_msgs
        ), debug_msgs


async def test_rejects_missing_agent_name(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "session_id": "sess-1",
            "group_id": "grp",
            "messages": [{"role": "user", "content": "q"}],
        },
    )
    assert resp.status_code == 422


async def test_rejects_blank_agent_name(client, mock_graphiti):
    resp = await client.post(
        "/capture",
        json={
            "session_id": "sess-1",
            "group_id": "grp",
            "agent_name": "",
            "messages": [{"role": "user", "content": "q"}],
        },
    )
    assert resp.status_code == 422
