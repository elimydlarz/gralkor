"""Trees: POST /tools/memory_search, POST /tools/memory_add."""

from __future__ import annotations

from types import SimpleNamespace

import main as main_mod

from graphiti_core.nodes import EpisodeType

from pipelines.distill import Turn

from .conftest import make_edge, make_entity


class TestMemorySearch:
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
            Turn(
                user_query="earlier tool question",
                events=[],
                assistant_answer="earlier tool answer",
            ),
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

