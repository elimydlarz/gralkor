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


async def test_rejects_blank_session_id(client, mock_graphiti):
    resp = await client.post(
        "/recall",
        json={"session_id": "", "group_id": "grp", "query": "q", "max_results": 10},
    )
    assert resp.status_code == 422


async def test_omitted_session_id_runs_with_empty_context_without_consulting_buffer(
    client, mock_graphiti
):
    append_turn(
        "some-other-session",
        "grp",
        Message(role="user", content="should not appear"),
        Message(role="assistant", content="should not appear either"),
    )
    mock_graphiti.search.return_value = [make_edge(fact="F")]
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["F — relevant."]}

    resp = await client.post(
        "/recall",
        json={"group_id": "grp", "query": "q", "max_results": 10},
    )
    assert resp.status_code == 200
    context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
    assert "Conversation context:\n\n\nMemory facts" in context
    assert "should not appear" not in context


async def test_no_search_results_returns_no_relevant_memories_block(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    resp = await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "q", "max_results": 10},
    )
    assert resp.status_code == 200
    block = resp.json()["memory_block"]
    assert block.startswith('<gralkor-memory trust="untrusted">')
    assert block.endswith("</gralkor-memory>")
    assert "No relevant memories found." in block
    assert "Search memory (up to 3 times, diverse queries)" in block
    mock_graphiti.llm_client.generate_response.assert_not_awaited()


async def test_lists_relevant_facts_when_interpret_returns_them(client, mock_graphiti):
    mock_graphiti.search.return_value = [
        make_edge(fact="Alice knows Bob", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    ]
    mock_graphiti.llm_client.generate_response.return_value = {
        "relevantFacts": ["Alice knows Bob — names the colleague the user asked about."]
    }

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
    assert "Alice knows Bob — names the colleague the user asked about." in block
    assert "Facts:" not in block
    assert "Interpretation:" not in block
    assert "Search memory (up to 3 times, diverse queries)" in block


async def test_returns_no_relevant_memories_block_when_interpret_returns_empty(
    client, mock_graphiti
):
    mock_graphiti.search.return_value = [make_edge(fact="totally unrelated")]
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": []}

    resp = await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "who is bob", "max_results": 10},
    )
    assert resp.status_code == 200
    block = resp.json()["memory_block"]
    assert block.startswith('<gralkor-memory trust="untrusted">')
    assert block.endswith("</gralkor-memory>")
    assert "No relevant memories found." in block
    assert "totally unrelated" not in block
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


async def test_applies_default_max_results_when_omitted(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    await client.post(
        "/recall",
        json={"session_id": "sess", "group_id": "grp", "query": "q"},
    )
    mock_graphiti.search.assert_awaited_once()
    call_kwargs = mock_graphiti.search.await_args.kwargs
    assert call_kwargs["num_results"] == 10


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
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["ok — relevant."]}

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
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["ok — relevant."]}

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
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["ok — relevant."]}

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
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["ok — relevant."]}

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
    mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["ok — relevant."]}

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
        mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["interp — relevant."]}
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
        mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["secret interp — relevant."]}
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
        mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["interp — relevant."]}
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "sensitive question", "max_results": 5},
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any("[gralkor] [test] recall query: sensitive question" in m for m in debug_msgs), debug_msgs
        assert any(
            "[gralkor] [test] recall block:" in m and "interp — relevant." in m
            for m in debug_msgs
        ), debug_msgs

    async def test_logs_no_memories_block_at_debug_when_empty(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        mock_graphiti.search.return_value = []
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "q", "max_results": 5},
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any(
            "[gralkor] [test] recall block:" in m and "No relevant memories found." in m
            for m in debug_msgs
        ), debug_msgs

    async def test_result_line_includes_per_stage_timings(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search.return_value = [make_edge(fact="Alice knows Bob")]
        mock_graphiti.llm_client.generate_response.return_value = {"relevantFacts": ["interp — relevant."]}
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "q", "max_results": 5},
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        result_lines = [m for m in info_msgs if "[gralkor] recall result —" in m]
        assert result_lines, info_msgs
        line = result_lines[0]
        assert "search:" in line and "interpret:" in line, line

    async def test_result_line_includes_per_stage_timings_when_empty(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search.return_value = []
        await client.post(
            "/recall",
            json={"session_id": "s", "group_id": "g", "query": "q", "max_results": 5},
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        result_lines = [m for m in info_msgs if "[gralkor] recall result —" in m]
        assert result_lines, info_msgs
        line = result_lines[0]
        assert "0 facts" in line
        assert "search:" in line and "interpret:0" in line, line


class TestRecallDeadline:
    """Reifies Recall > /recall deadline.

    /recall completes within a bounded time budget. If the budget is exhausted
    before the handler returns, in-flight upstream work is cancelled and the
    response is 504 with {"error": "recall deadline expired"}.
    """

    async def test_returns_504_when_handler_body_exceeds_the_deadline(
        self, client, mock_graphiti, monkeypatch
    ):
        monkeypatch.setattr(main_mod, "RECALL_DEADLINE_SECONDS", 0.05)

        import asyncio as _asyncio

        async def slow_search(*_args, **_kwargs):
            await _asyncio.sleep(1.0)
            return []

        mock_graphiti.search.side_effect = slow_search

        resp = await client.post(
            "/recall",
            json={"session_id": "s1", "group_id": "grp", "query": "q", "max_results": 10},
        )
        assert resp.status_code == 504
        assert resp.json() == {"error": "recall deadline expired"}


class TestRecallRetriesVertexRateLimit:
    """Reifies Retry ownership > Vertex-upstream rate-limit.

    owner: /recall — the first 429 during /recall is absorbed by one retry
    before surfacing. A second 429 in the same recall surfaces per
    rate-limit-retry.
    """

    async def test_first_429_from_search_is_absorbed_by_one_retry(
        self, client, mock_graphiti, monkeypatch
    ):
        # Zero the retry delay so the test is fast.
        monkeypatch.setattr(main_mod, "RECALL_RETRY_DELAY_SECONDS", 0.0)

        class RateLimitError(Exception):
            pass

        call_count = {"n": 0}

        async def search_raises_once(*_args, **_kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RateLimitError("rate limited")
            return []

        mock_graphiti.search.side_effect = search_raises_once

        resp = await client.post(
            "/recall",
            json={"session_id": "s1", "group_id": "grp", "query": "q", "max_results": 10},
        )
        assert resp.status_code == 200
        assert "No relevant memories found." in resp.json()["memory_block"]
        assert call_count["n"] == 2

    async def test_second_429_from_search_surfaces(
        self, client, mock_graphiti, monkeypatch
    ):
        monkeypatch.setattr(main_mod, "RECALL_RETRY_DELAY_SECONDS", 0.0)

        class RateLimitError(Exception):
            pass

        mock_graphiti.search.side_effect = RateLimitError("rate limited")

        resp = await client.post(
            "/recall",
            json={"session_id": "s1", "group_id": "grp", "query": "q", "max_results": 10},
        )
        assert resp.status_code == 429
        assert mock_graphiti.search.await_count == 2

    async def test_non_429_error_from_search_is_not_retried(
        self, client, mock_graphiti, monkeypatch
    ):
        monkeypatch.setattr(main_mod, "RECALL_RETRY_DELAY_SECONDS", 0.0)

        class InternalError(Exception):
            status_code = 500

        mock_graphiti.search.side_effect = InternalError("boom")

        resp = await client.post(
            "/recall",
            json={"session_id": "s1", "group_id": "grp", "query": "q", "max_results": 10},
        )
        # Surfaces via downstream-error-handling, not retried.
        assert resp.status_code == 502
        assert mock_graphiti.search.await_count == 1

    async def test_first_429_from_interpret_is_absorbed_by_one_retry(
        self, client, mock_graphiti, monkeypatch
    ):
        monkeypatch.setattr(main_mod, "RECALL_RETRY_DELAY_SECONDS", 0.0)

        mock_graphiti.search.return_value = [make_edge()]

        class RateLimitError(Exception):
            pass

        call_count = {"n": 0}

        async def generate_raises_once(*_args, **_kwargs):
            call_count["n"] += 1
            if call_count["n"] == 1:
                raise RateLimitError("rate limited")
            return {"relevantFacts": ["an interpretation — relevant."]}

        mock_graphiti.llm_client.generate_response = generate_raises_once

        resp = await client.post(
            "/recall",
            json={"session_id": "s1", "group_id": "grp", "query": "q", "max_results": 10},
        )
        assert resp.status_code == 200
        assert "an interpretation" in resp.json()["memory_block"]
        assert call_count["n"] == 2

    async def test_second_429_from_interpret_surfaces(
        self, client, mock_graphiti, monkeypatch
    ):
        monkeypatch.setattr(main_mod, "RECALL_RETRY_DELAY_SECONDS", 0.0)

        mock_graphiti.search.return_value = [make_edge()]

        class RateLimitError(Exception):
            pass

        call_count = {"n": 0}

        async def generate_always_429(*_args, **_kwargs):
            call_count["n"] += 1
            raise RateLimitError("rate limited")

        mock_graphiti.llm_client.generate_response = generate_always_429

        resp = await client.post(
            "/recall",
            json={"session_id": "s1", "group_id": "grp", "query": "q", "max_results": 10},
        )
        assert resp.status_code == 429
        assert call_count["n"] == 2
