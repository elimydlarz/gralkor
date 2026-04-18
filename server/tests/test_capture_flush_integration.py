"""Phase A smoke test: POST /capture → idle flush → graphiti.add_episode.

Wired against mocked graphiti to avoid needing a real FalkorDB. Proves the
pipeline composes: capture endpoint → buffer → distill → episode ingestion.
"""

from __future__ import annotations

import asyncio

import main as main_mod
from pipelines.capture_buffer import CaptureBuffer


async def test_capture_idle_flush_calls_add_episode(mock_graphiti):
    """End-to-end: post to /capture, wait for idle, confirm add_episode fires."""
    original_graphiti = main_mod.graphiti
    original_buffer = main_mod.capture_buffer
    main_mod.graphiti = mock_graphiti
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "did things"}

    try:
        from httpx import ASGITransport, AsyncClient

        main_mod.capture_buffer = CaptureBuffer(
            idle_seconds=0.05,
            flush_callback=main_mod._capture_flush,
        )
        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/capture",
                json={
                    "session_id": "smoke-sess",
                    "group_id": "smoke-grp",
                    "turn": {
                        "user_query": "remember this",
                        "events": [{"kind": "thinking", "text": "processing"}],
                        "assistant_answer": "stored",
                    },
                },
            )
            assert resp.status_code == 204

            await asyncio.sleep(0.2)

        mock_graphiti.add_episode.assert_awaited()
        kwargs = mock_graphiti.add_episode.await_args.kwargs
        assert kwargs["group_id"] == "smoke_grp"
        assert kwargs["source_description"] == "auto-capture"
        assert "User: remember this" in kwargs["episode_body"]
        assert "Assistant: stored" in kwargs["episode_body"]
    finally:
        main_mod.graphiti = original_graphiti
        main_mod.capture_buffer = original_buffer


async def test_lifespan_flush_all_drains_buffer(mock_graphiti):
    """flush_all on shutdown should drain pending buffers."""
    original_graphiti = main_mod.graphiti
    original_buffer = main_mod.capture_buffer
    main_mod.graphiti = mock_graphiti
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "x"}

    try:
        buffer = CaptureBuffer(
            idle_seconds=3600.0,
            flush_callback=main_mod._capture_flush,
        )
        main_mod.capture_buffer = buffer

        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/capture",
                json={
                    "session_id": "sess-drain",
                    "group_id": "grp",
                    "turn": {"user_query": "q", "events": [], "assistant_answer": "a"},
                },
            )

        assert buffer.has("sess-drain")
        await buffer.flush_all()
        mock_graphiti.add_episode.assert_awaited()
    finally:
        main_mod.graphiti = original_graphiti
        main_mod.capture_buffer = original_buffer
