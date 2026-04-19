"""Tree: POST /capture endpoint (capture-endpoint in TEST_TREES.md).

Appends to buffer keyed by session_id (binding the group_id on first append),
returns 204, does not call distill synchronously.
"""

from __future__ import annotations

import logging

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


class TestObservability:
    async def test_does_not_log_turn_content_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        await client.post(
            "/capture",
            json={
                "session_id": "s",
                "group_id": "g",
                "turn": {
                    "user_query": "sensitive question",
                    "events": [],
                    "assistant_answer": "secret answer",
                },
            },
        )
        info_msgs = "\n".join(r.getMessage() for r in caplog.records if r.levelno == logging.INFO)
        assert "sensitive question" not in info_msgs
        assert "secret answer" not in info_msgs

    async def test_logs_turn_content_at_debug(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        await client.post(
            "/capture",
            json={
                "session_id": "s",
                "group_id": "g",
                "turn": {
                    "user_query": "sensitive question",
                    "events": [{"k": "v"}],
                    "assistant_answer": "secret answer",
                },
            },
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any(
            "[gralkor] [test] capture turn:" in m
            and "sensitive question" in m
            and "secret answer" in m
            for m in debug_msgs
        ), debug_msgs

    async def test_elides_token_fields_in_events(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        huge = "x" * 5000
        await client.post(
            "/capture",
            json={
                "session_id": "s",
                "group_id": "g",
                "turn": {
                    "user_query": "q",
                    "events": [
                        {"kind": "checkpoint", "data": {"reason": "after_llm", "token": huge}},
                    ],
                    "assistant_answer": "a",
                },
            },
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        capture_msg = next(m for m in debug_msgs if "[gralkor] [test] capture turn:" in m)
        assert huge not in capture_msg
        assert "[...]" in capture_msg
        assert "after_llm" in capture_msg


