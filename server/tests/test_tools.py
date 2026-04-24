"""Trees: POST /tools/memory_search, POST /tools/memory_add."""

from __future__ import annotations

import logging
from types import SimpleNamespace

import main as main_mod

from graphiti_core.nodes import EpisodeType

from pipelines.messages import Message

from .conftest import make_edge, make_entity


def _empty_search_result() -> SimpleNamespace:
    return SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )


class TestMemorySearch:
    async def test_rejects_blank_session_id(self, client, mock_graphiti):
        resp = await client.post(
            "/tools/memory_search",
            json={
                "session_id": "",
                "group_id": "grp",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        assert resp.status_code == 422

    async def test_rejects_missing_session_id(self, client, mock_graphiti):
        resp = await client.post(
            "/tools/memory_search",
            json={
                "group_id": "grp",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        assert resp.status_code == 422

    async def test_uses_slow_mode_with_cross_encoder(self, client, mock_graphiti):
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="A")],
            nodes=[make_entity(name="Alice")],
            episodes=[],
            communities=[],
            edge_reranker_scores=[],
            node_reranker_scores=[],
            episode_reranker_scores=[],
            community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "Alice is relevant."}

        resp = await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess",
                "group_id": "grp",
                "query": "alice",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        assert resp.status_code == 200
        mock_graphiti.search_.assert_awaited_once()
        text = resp.json()["text"]
        assert "Facts:" in text
        assert "- A" in text
        assert "Entities:" in text
        assert "- Alice:" in text
        assert "Interpretation:" in text
        assert "Alice is relevant." in text

    async def test_no_further_querying_instruction(self, client, mock_graphiti):
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="A")],
            nodes=[],
            episodes=[],
            communities=[],
            edge_reranker_scores=[],
            node_reranker_scores=[],
            episode_reranker_scores=[],
            community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}
        resp = await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess",
                "group_id": "grp",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        assert "Search memory (up to 3 times" not in resp.json()["text"]

    async def test_empty_graph_returns_none_without_interpret(self, client, mock_graphiti):
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[],
            nodes=[],
            episodes=[],
            communities=[],
            edge_reranker_scores=[],
            node_reranker_scores=[],
            episode_reranker_scores=[],
            community_reranker_scores=[],
        )

        resp = await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess",
                "group_id": "grp",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        assert resp.status_code == 200
        assert resp.json()["text"] == "Facts: (none)\nEntities: (none)"
        mock_graphiti.llm_client.generate_response.assert_not_awaited()

    async def test_respects_max_entity_results(self, client, mock_graphiti):
        entities = [make_entity(uuid=f"n{i}", name=f"E{i}") for i in range(5)]
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[],
            nodes=entities,
            episodes=[],
            communities=[],
            edge_reranker_scores=[],
            node_reranker_scores=[],
            episode_reranker_scores=[],
            community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}
        resp = await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess",
                "group_id": "grp",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 2,
            },
        )
        text = resp.json()["text"]
        assert "- E0:" in text
        assert "- E1:" in text
        assert "- E2:" not in text

    async def test_applies_defaults_when_max_args_omitted(self, client, mock_graphiti):
        entities = [make_entity(uuid=f"n{i}", name=f"E{i}") for i in range(12)]
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[],
            nodes=entities,
            episodes=[],
            communities=[],
            edge_reranker_scores=[],
            node_reranker_scores=[],
            episode_reranker_scores=[],
            community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}
        resp = await client.post(
            "/tools/memory_search",
            json={"session_id": "sess", "group_id": "grp", "query": "q"},
        )
        assert resp.status_code == 200

        call = mock_graphiti.search_.await_args
        assert call.kwargs["config"].limit == 20

        text = resp.json()["text"]
        assert "- E9:" in text
        assert "- E10:" not in text

    async def test_sanitizes_group_id(self, client, mock_graphiti):
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[], nodes=[], episodes=[], communities=[],
            edge_reranker_scores=[], node_reranker_scores=[],
            episode_reranker_scores=[], community_reranker_scores=[],
        )
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess",
                "group_id": "my-agent",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        call = mock_graphiti.search_.await_args
        assert call.kwargs["group_ids"] == ["my_agent"]

    async def test_conversation_context_comes_from_capture_buffer(self, client, mock_graphiti):
        main_mod.capture_buffer.append(
            "sess-tool",
            "grp",
            [
                Message(role="user", content="earlier tool question"),
                Message(role="assistant", content="earlier tool answer"),
            ],
        )
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="A")],
            nodes=[],
            episodes=[],
            communities=[],
            edge_reranker_scores=[],
            node_reranker_scores=[],
            episode_reranker_scores=[],
            community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess-tool",
                "group_id": "grp",
                "query": "q",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        context = mock_graphiti.llm_client.generate_response.await_args.args[0][1].content
        assert "earlier tool question" in context
        assert "earlier tool answer" in context


class TestMemorySearchObservability:
    async def test_logs_entry_and_empty_result_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search_.return_value = _empty_search_result()
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "sess",
                "group_id": "grp",
                "query": "alice",
                "max_results": 20,
                "max_entity_results": 10,
            },
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        assert any(
            "[gralkor] tools.memory_search —" in m
            and "session:sess" in m and "group:grp" in m
            and "queryChars:5" in m and "max:20/10" in m
            for m in info_msgs
        ), info_msgs
        assert any(
            "[gralkor] tools.memory_search result — 0 facts 0 entities" in m
            for m in info_msgs
        ), info_msgs

    async def test_logs_non_empty_result_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="A"), make_edge(fact="B")],
            nodes=[make_entity(name="Alice")],
            episodes=[], communities=[],
            edge_reranker_scores=[], node_reranker_scores=[],
            episode_reranker_scores=[], community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "i"}
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "s", "group_id": "g", "query": "q",
                "max_results": 20, "max_entity_results": 10,
            },
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        assert any(
            "[gralkor] tools.memory_search result — 2 facts 1 entities" in m
            and "textChars:" in m
            for m in info_msgs
        ), info_msgs

    async def test_does_not_log_content_at_info(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="secret fact")],
            nodes=[], episodes=[], communities=[],
            edge_reranker_scores=[], node_reranker_scores=[],
            episode_reranker_scores=[], community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "secret interp"}
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "s", "group_id": "g", "query": "sensitive",
                "max_results": 20, "max_entity_results": 10,
            },
        )
        info_joined = "\n".join(r.getMessage() for r in caplog.records if r.levelno == logging.INFO)
        assert "sensitive" not in info_joined
        assert "secret fact" not in info_joined
        assert "secret interp" not in info_joined

    async def test_logs_query_and_text_at_debug(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.DEBUG, logger="main")
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="Alice knows Bob")],
            nodes=[], episodes=[], communities=[],
            edge_reranker_scores=[], node_reranker_scores=[],
            episode_reranker_scores=[], community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "interp"}
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "s", "group_id": "g", "query": "sensitive q",
                "max_results": 20, "max_entity_results": 10,
            },
        )
        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any(
            "[gralkor] [test] tools.memory_search query: sensitive q" in m for m in debug_msgs
        ), debug_msgs
        assert any(
            "[gralkor] [test] tools.memory_search text:" in m
            and "Alice knows Bob" in m and "interp" in m
            for m in debug_msgs
        ), debug_msgs

    async def test_result_line_includes_per_stage_timings(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search_.return_value = SimpleNamespace(
            edges=[make_edge(fact="A")],
            nodes=[make_entity(name="Alice")],
            episodes=[], communities=[],
            edge_reranker_scores=[], node_reranker_scores=[],
            episode_reranker_scores=[], community_reranker_scores=[],
        )
        mock_graphiti.llm_client.generate_response.return_value = {"text": "i"}
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "s", "group_id": "g", "query": "q",
                "max_results": 20, "max_entity_results": 10,
            },
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        result_lines = [m for m in info_msgs if "[gralkor] tools.memory_search result —" in m]
        assert result_lines, info_msgs
        line = result_lines[0]
        assert "(lock_wait:" in line and "search:" in line and "interpret:" in line, line

    async def test_result_line_includes_per_stage_timings_when_empty(self, client, mock_graphiti, caplog):
        caplog.set_level(logging.INFO, logger="main")
        mock_graphiti.search_.return_value = _empty_search_result()
        await client.post(
            "/tools/memory_search",
            json={
                "session_id": "s", "group_id": "g", "query": "q",
                "max_results": 20, "max_entity_results": 10,
            },
        )
        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        result_lines = [m for m in info_msgs if "[gralkor] tools.memory_search result —" in m]
        assert result_lines, info_msgs
        line = result_lines[0]
        assert "0 facts 0 entities" in line
        assert "(lock_wait:" in line and "search:" in line and "interpret:0" in line, line


class TestMemoryAdd:
    async def test_wraps_episodes_with_source_text(self, client, mock_graphiti):
        resp = await client.post(
            "/tools/memory_add",
            json={
                "group_id": "grp",
                "content": "User prefers Postgres.",
                "source_description": "agent reflection",
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "stored"}
        mock_graphiti.add_episode.assert_awaited_once()
        kwargs = mock_graphiti.add_episode.await_args.kwargs
        assert kwargs["source"] == EpisodeType.text
        assert kwargs["episode_body"] == "User prefers Postgres."
        assert kwargs["source_description"] == "agent reflection"

    async def test_sanitizes_group_id(self, client, mock_graphiti):
        await client.post(
            "/tools/memory_add",
            json={"group_id": "my-agent", "content": "x"},
        )
        kwargs = mock_graphiti.add_episode.await_args.kwargs
        assert kwargs["group_id"] == "my_agent"

    async def test_defaults_source_description(self, client, mock_graphiti):
        await client.post(
            "/tools/memory_add",
            json={"group_id": "g", "content": "x"},
        )
        kwargs = mock_graphiti.add_episode.await_args.kwargs
        assert kwargs["source_description"] == "manual"

    async def test_auto_generates_name(self, client, mock_graphiti):
        await client.post(
            "/tools/memory_add",
            json={"group_id": "g", "content": "x"},
        )
        kwargs = mock_graphiti.add_episode.await_args.kwargs
        assert kwargs["name"].startswith("manual-add-")


