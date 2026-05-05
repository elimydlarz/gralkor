"""Phase A smoke test: POST /capture → /session_end flush → graphiti.add_episode.

Wired against mocked graphiti to avoid needing a real FalkorDB. Proves the
pipeline composes: capture endpoint → buffer → /session_end → distill →
episode ingestion.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import contextmanager

import main as main_mod
from pipelines.capture_buffer import CaptureBuffer


@contextmanager
def _patched_graphiti(mock_graphiti):
    original_factory = main_mod._graphiti_for
    original_llm = main_mod._llm_client
    original_falkor = main_mod._falkor_db
    original_buffer = main_mod.capture_buffer
    main_mod._graphiti_for = lambda group_id: mock_graphiti
    main_mod._llm_client = mock_graphiti.llm_client
    main_mod._falkor_db = object()  # truthy sentinel; _capture_flush only checks for None
    main_mod.capture_buffer = CaptureBuffer(flush_callback=main_mod._capture_flush)
    try:
        yield main_mod.capture_buffer
    finally:
        main_mod.capture_buffer = original_buffer
        main_mod._falkor_db = original_falkor
        main_mod._llm_client = original_llm
        main_mod._graphiti_for = original_factory


async def test_session_end_triggers_add_episode(mock_graphiti):
    """End-to-end: post to /capture, then /session_end, confirm add_episode fires."""
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "did things"}

    with _patched_graphiti(mock_graphiti):
        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/capture",
                json={
                    "session_id": "smoke-sess",
                    "group_id": "smoke-grp",
                    "messages": [
                        {"role": "user", "content": "remember this"},
                        {"role": "behaviour", "content": "thought: processing"},
                        {"role": "assistant", "content": "stored"},
                    ],
                },
            )
            assert resp.status_code == 204

            resp = await client.post("/session_end", json={"session_id": "smoke-sess"})
            assert resp.status_code == 204
            await asyncio.sleep(0.2)

        mock_graphiti.add_episode.assert_awaited()
        kwargs = mock_graphiti.add_episode.await_args.kwargs
        assert kwargs["group_id"] == "smoke_grp"
        assert kwargs["source_description"] == "auto-capture"
        assert "User: remember this" in kwargs["episode_body"]
        assert "Assistant: stored" in kwargs["episode_body"]


async def test_flush_logs_entry_and_success_at_info(mock_graphiti, caplog):
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "did things"}
    caplog.set_level(logging.INFO, logger="main")

    with _patched_graphiti(mock_graphiti):
        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/capture",
                json={
                    "session_id": "sess-flush",
                    "group_id": "flush-grp",
                    "messages": [
                        {"role": "user", "content": "q"},
                        {"role": "behaviour", "content": "thought: considering"},
                        {"role": "assistant", "content": "a"},
                    ],
                },
            )
            await client.post("/session_end", json={"session_id": "sess-flush"})
            await asyncio.sleep(0.25)

        info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
        assert any(
            "[gralkor] capture flushed —" in m and "group:flush_grp" in m
            and "uuid:ep-001" in m and "bodyChars:" in m
            for m in info_msgs
        ), info_msgs


async def test_flush_skips_on_empty_body(mock_graphiti, caplog):
    with _patched_graphiti(mock_graphiti):
        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/capture",
                json={
                    "session_id": "sess-empty",
                    "group_id": "grp",
                    "messages": [],
                },
            )
            await client.post("/session_end", json={"session_id": "sess-empty"})
            await asyncio.sleep(0.25)

        mock_graphiti.add_episode.assert_not_awaited()


async def test_flush_logs_body_at_debug(mock_graphiti, caplog):
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "did things"}
    caplog.set_level(logging.DEBUG, logger="main")

    with _patched_graphiti(mock_graphiti):
        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/capture",
                json={
                    "session_id": "sess-dbg",
                    "group_id": "grp",
                    "messages": [
                        {"role": "user", "content": "sensitive"},
                        {"role": "behaviour", "content": "thought: x"},
                        {"role": "assistant", "content": "answer"},
                    ],
                },
            )
            await client.post("/session_end", json={"session_id": "sess-dbg"})
            await asyncio.sleep(0.25)

        debug_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.DEBUG]
        assert any(
            "[gralkor] [test] capture flush body:" in m and "sensitive" in m and "answer" in m
            for m in debug_msgs
        ), debug_msgs


async def test_lifespan_flush_all_drains_buffer(mock_graphiti):
    """flush_all on shutdown should drain pending buffers."""
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "x"}

    with _patched_graphiti(mock_graphiti) as buffer:
        from httpx import ASGITransport, AsyncClient

        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/capture",
                json={
                    "session_id": "sess-drain",
                    "group_id": "grp",
                    "messages": [
                        {"role": "user", "content": "q"},
                        {"role": "assistant", "content": "a"},
                    ],
                },
            )

        assert buffer.has("sess-drain")
        await buffer.flush_all()
        mock_graphiti.add_episode.assert_awaited()
