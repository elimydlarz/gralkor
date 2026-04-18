"""Tree: POST /recall endpoint.

Composes fast search + format + interpret + XML wrap.
Empty search → {"memory_block": ""}. Bearer auth required.
Conversation context for interpretation is read from capture_buffer by
session_id — callers do not pass conversation messages on the wire.
"""

from __future__ import annotations

from datetime import datetime, timezone

import main as main_mod
from pipelines.capture_buffer import CaptureBuffer
from pipelines.distill import Turn

from .conftest import make_edge


def _install_buffer() -> CaptureBuffer:
    async def _noop(_group_id, _turns):
        return None

    buffer = CaptureBuffer(idle_seconds=3600.0, flush_callback=_noop)
    main_mod.capture_buffer = buffer
    return buffer


async def test_returns_empty_block_when_no_facts(client, mock_graphiti):
    _install_buffer()
    mock_graphiti.search.return_value = []
    resp = await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "q", "max_results": 10},
    )
    assert resp.status_code == 200
    assert resp.json() == {"memory_block": ""}
    mock_graphiti.llm_client.generate_response.assert_not_awaited()


async def test_interprets_and_wraps_when_facts_exist(client, mock_graphiti):
    _install_buffer()
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
    _install_buffer()
    mock_graphiti.search.return_value = []
    await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "q", "max_results": 5},
    )
    mock_graphiti.search.assert_awaited_once()
    call_kwargs = mock_graphiti.search.await_args.kwargs
    assert call_kwargs["num_results"] == 5


async def test_sanitizes_hyphenated_group_id(client, mock_graphiti):
    _install_buffer()
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
    buffer = _install_buffer()
    buffer.append(
        "sess-with-history",
        "grp",
        Turn(user_query="earlier question", events=[], assistant_answer="earlier answer"),
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


async def test_empty_buffer_runs_interpretation_with_empty_context(client, mock_graphiti):
    _install_buffer()
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
    buffer = _install_buffer()
    buffer.append(
        "sess-alpha",
        "grp",
        Turn(user_query="alpha secret", events=[], assistant_answer="alpha reply"),
    )
    buffer.append(
        "sess-beta",
        "grp",
        Turn(user_query="beta secret", events=[], assistant_answer="beta reply"),
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


async def test_strips_gralkor_memory_from_buffered_turns(client, mock_graphiti):
    buffer = _install_buffer()
    buffer.append(
        "sess-leak",
        "grp",
        Turn(
            user_query="<gralkor-memory>leaked</gralkor-memory>actual question",
            events=[],
            assistant_answer="a",
        ),
    )
    mock_graphiti.search.return_value = [make_edge(fact="A")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "session_id": "sess-leak",
            "group_id": "grp",
            "query": "q",
            "max_results": 10,
        },
    )
    interpret_context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "leaked" not in interpret_context
    assert "actual question" in interpret_context


async def test_bearer_auth_required(client, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "t")
    resp = await client.post(
        "/recall",
        json={"session_id": "s", "group_id": "g", "query": "q", "max_results": 1},
    )
    assert resp.status_code == 401
