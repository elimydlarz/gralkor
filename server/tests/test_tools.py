"""Trees: POST /tools/memory_add."""

from __future__ import annotations

from graphiti_core.nodes import EpisodeType


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


