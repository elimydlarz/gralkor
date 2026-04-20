"""Tree: POST /recall endpoint.

Composes fast search + format + interpret + XML wrap.
Empty search → {"memory_block": ""}.
Conversation context for interpretation is read from capture_buffer by
session_id (a flat walk of all buffered Messages across all buffered turns).
Callers do not pass conversation messages on the wire.

The server no longer strips adapter-injected artifacts from buffered
messages — adapters are expected to clean at capture time.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

import main as main_mod
from pipelines.messages import Message

from .conftest import make_edge


def append_turn(session_id: str, group_id: str, *messages: Message) -> None:
    main_mod.capture_buffer.append(session_id, group_id, list(messages))


async def test_returns_empty_block_when_no_facts(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    resp = await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "q", "max_results": 10},
    )
    assert resp.status_code == 200
    assert resp.json() == {"memory_block": ""}
    mock_graphiti.llm_client.generate_response.assert_not_awaited()


async def test_interprets_and_wraps_when_facts_exist(client, mock_graphiti):
    mock_graphiti.search.return_value = [
        make_edge(fact="Alice knows Bob", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    ]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "Alice and Bob are colleagues."}

    resp = await client.post(
        "/recall",
        json={
            "session_id": "sess",
            "group_id": "grp",
            "query": "who is bob",
            "max_results": 10,
        },
    )
    assert resp.status_code == 200
    block = resp.json()["memory_block"]
    assert block.startswith('<gralkor-memory trust="untrusted">')
    assert block.endswith("</gralkor-memory>")
    assert "Facts:" in block
    assert "Alice knows Bob" in block
    assert "Interpretation:" in block
    assert "Alice and Bob are colleagues." in block
    assert "Search memory (up to 3 times, diverse queries)" in block


async def test_uses_fast_mode(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "q", "max_results": 5},
    )
    mock_graphiti.search.assert_awaited_once()
    call_kwargs = mock_graphiti.search.await_args.kwargs
    assert call_kwargs["num_results"] == 5


async def test_sanitizes_hyphenated_group_id(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    await client.post(
        "/recall",
        json={
            "session_id": "sess",
            "group_id": "my-agent-id",
            "query": "q",
            "max_results": 10,
        },
    )
    call_kwargs = mock_graphiti.search.await_args.kwargs
    assert call_kwargs["group_ids"] == ["my_agent_id"]


async def test_conversation_context_comes_from_capture_buffer(client, mock_graphiti):
    append_turn(
        "sess-with-history",
        "grp",
        Message(role="user", content="earlier question"),
        Message(role="assistant", content="earlier answer"),
    )
    mock_graphiti.search.return_value = [make_edge(fact="F")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "session_id": "sess-with-history",
            "group_id": "grp",
            "query": "current question",
            "max_results": 10,
        },
    )
    interpret_context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "earlier question" in interpret_context
    assert "earlier answer" in interpret_context


async def test_behaviour_messages_appear_in_interpretation_context(client, mock_graphiti):
    append_turn(
        "sess-with-behaviour",
        "grp",
        Message(role="user", content="q"),
        Message(role="behaviour", content="thought: I should check memory"),
        Message(role="assistant", content="a"),
    )
    mock_graphiti.search.return_value = [make_edge(fact="F")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "session_id": "sess-with-behaviour",
            "group_id": "grp",
            "query": "q",
            "max_results": 10,
        },
    )
    interpret_context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "Agent did: thought: I should check memory" in interpret_context


async def test_empty_buffer_runs_interpretation_with_empty_context(client, mock_graphiti):
    mock_graphiti.search.return_value = [make_edge(fact="F")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "session_id": "brand-new-session",
            "group_id": "grp",
            "query": "q",
            "max_results": 10,
        },
    )
    interpret_context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "Conversation context:\n\n\nMemory facts" in interpret_context


async def test_different_sessions_do_not_cross_contaminate(client, mock_graphiti):
    append_turn(
        "sess-alpha",
        "grp",
        Message(role="user", content="alpha secret"),
        Message(role="assistant", content="alpha reply"),
    )
    append_turn(
        "sess-beta",
        "grp",
        Message(role="user", content="beta secret"),
        Message(role="assistant", content="beta reply"),
    )
    mock_graphiti.search.return_value = [make_edge(fact="F")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "session_id": "sess-alpha",
            "group_id": "grp",
            "query": "q",
            "max_results": 10,
        },
    )
    context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "alpha secret" in context
    assert "beta secret" not in context


async def test_server_passes_buffered_content_unchanged_to_interpretation(client, mock_graphiti):
    append_turn(
        "sess-passthrough",
        "grp",
        Message(role="user", content="<gralkor-memory>leaked</gralkor-memory>actual question"),
        Message(role="assistant", content="a"),
    )
    mock_graphiti.search.return_value = [make_edge(fact="A")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "session_id": "sess-passthrough",
            "group_id": "grp",
            "query": "q",
            "max_results": 10,
        },
    )
    interpret_context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "<gralkor-memory>" in interpret_context
    assert "actual question" in interpret_context


class TestObservability:
    async def test_logs_entry_and_empty_result_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search.return_value = []
        await client.post(
            "/recall",
            json={"session_id": "sess", "group_id": "grp", "query": "who", "max_results": 10},
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        assert any(
            "[gralkor] recall —" in m and "session:sess" in m and "group:grp" in m
            and "queryChars:3" in m and "max:10" in m
            for m in info_msgs
        ), info_msgs
        assert any("[gralkor] recall result — 0 facts" in m for m in info_msgs), info_msgs

    async def test_logs_non_empty_result_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search.return_value = [make_edge(fact="Alice knows Bob")]
        mock_graphiti.llm_client.generate_response.return_value = {"text": "interp"}
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "q", "max_results": 5},
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        assert any(
            "[gralkor] recall result — 1 facts" in m and "blockChars:" in m
            for m in info_msgs
        ), info_msgs

    async def test_does_not_log_content_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search.return_value = [make_edge(fact="secret fact")]
        mock_graphiti.llm_client.generate_response.return_value = {"text": "secret interp"}
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "sensitive question", "max_results": 5},
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        joined = "\n".join(info_msgs)
        assert "sensitive question" not in joined
        assert "secret fact" not in joined
        assert "secret interp" not in joined

    async def test_logs_query_and_block_at_debug(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        mock_graphiti.search.return_value = [make_edge(fact="Alice knows Bob")]
        mock_graphiti.llm_client.generate_response.return_value = {"text": "interp"}
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "sensitive question", "max_results": 5},
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any("[gralkor] [test] recall query: sensitive question" in m for m in debug_msgs), debug_msgs
        assert any(
            "[gralkor] [test] recall block:" in m and "Alice knows Bob" in m and "interp" in m
            for m in debug_msgs
        ), debug_msgs

    async def test_no_block_debug_when_empty(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        mock_graphiti.search.return_value = []
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "q", "max_results": 5},
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert not any("[gralkor] [test] recall block:" in m for m in debug_msgs)
