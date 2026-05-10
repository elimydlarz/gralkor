"""Tests for the lifespan function's FalkorDB initialization."""

from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _empty_search_result() -> SimpleNamespace:
    return SimpleNamespace(
        edges=[], nodes=[], episodes=[], communities=[],
        edge_reranker_scores=[], node_reranker_scores=[],
        episode_reranker_scores=[], community_reranker_scores=[],
    )


def _make_graphiti_mock(*, has_indices=True):
    """Create a Graphiti mock with configurable index state."""
    mock = AsyncMock()
    if has_indices:
        mock.driver.execute_query.return_value = ([{"label": "Entity"}], [], [])
    else:
        mock.driver.execute_query.return_value = ([], [], [])
    mock.search.return_value = []
    mock.search_.return_value = _empty_search_result()
    mock.llm_client.generate_response.return_value = {"relevantFacts": []}
    return mock


@pytest.mark.asyncio
async def test_embedded_mode(tmp_path, monkeypatch):
    """Lifespan uses embedded FalkorDBLite."""
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))

    mock_async_db = MagicMock()
    mock_driver_cls = MagicMock()
    mock_graphiti_cls = MagicMock()
    mock_graphiti_instance = _make_graphiti_mock()
    mock_graphiti_cls.return_value = mock_graphiti_instance

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", mock_driver_cls),
        patch("main.Graphiti", mock_graphiti_cls),
        patch("redislite.async_falkordb_client.AsyncFalkorDB", return_value=mock_async_db),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

        # _graphiti_for instantiates a FalkorDriver per call (boot index check
        # + warmup); both share the same AsyncFalkorDB.
        assert mock_driver_cls.call_count >= 1
        for call in mock_driver_cls.call_args_list:
            assert call.kwargs["falkor_db"] is mock_async_db


@pytest.mark.asyncio
async def test_skips_index_build_when_indices_exist(tmp_path, monkeypatch):
    """When indices already exist, lifespan skips build_indices_and_constraints."""
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))

    mock_graphiti_instance = _make_graphiti_mock(has_indices=True)
    mock_graphiti_cls = MagicMock(return_value=mock_graphiti_instance)

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", MagicMock()),
        patch("main.Graphiti", mock_graphiti_cls),
        patch("redislite.async_falkordb_client.AsyncFalkorDB", return_value=MagicMock()),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

        mock_graphiti_instance.driver.execute_query.assert_called_once_with("CALL db.indexes()")
        mock_graphiti_instance.build_indices_and_constraints.assert_not_called()


@pytest.mark.asyncio
async def test_builds_indices_on_fresh_db(tmp_path, monkeypatch):
    """When no indices exist (fresh DB), lifespan calls build_indices_and_constraints."""
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))

    mock_graphiti_instance = _make_graphiti_mock(has_indices=False)
    mock_graphiti_cls = MagicMock(return_value=mock_graphiti_instance)

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", MagicMock()),
        patch("main.Graphiti", mock_graphiti_cls),
        patch("redislite.async_falkordb_client.AsyncFalkorDB", return_value=MagicMock()),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

        mock_graphiti_instance.driver.execute_query.assert_called_once_with("CALL db.indexes()")
        mock_graphiti_instance.build_indices_and_constraints.assert_called_once()


@pytest.mark.asyncio
async def test_warms_search_path_before_yield(tmp_path, monkeypatch, caplog):
    """Lifespan exercises search and interpret once before yielding,
    so the first real /recall doesn't eat the cold-path cost."""
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))
    caplog.set_level(logging.INFO, logger="main")

    mock_graphiti_instance = _make_graphiti_mock(has_indices=True)
    mock_graphiti_cls = MagicMock(return_value=mock_graphiti_instance)

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", MagicMock()),
        patch("main.Graphiti", mock_graphiti_cls),
        patch("redislite.async_falkordb_client.AsyncFalkorDB", return_value=MagicMock()),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

    mock_graphiti_instance.search.assert_awaited_once()
    mock_graphiti_instance.llm_client.generate_response.assert_awaited()
    info_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.INFO]
    assert any(
        "[gralkor] warmup —" in m and "search:" in m and "interpret:" in m
        for m in info_msgs
    ), info_msgs


@pytest.mark.asyncio
async def test_warmup_failure_does_not_block_boot(tmp_path, monkeypatch, caplog):
    """If a warmup call raises, boot still completes and the failure is logged."""
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))
    caplog.set_level(logging.WARNING, logger="main")

    mock_graphiti_instance = _make_graphiti_mock(has_indices=True)
    mock_graphiti_instance.search.side_effect = RuntimeError("boom")
    mock_graphiti_cls = MagicMock(return_value=mock_graphiti_instance)

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", MagicMock()),
        patch("main.Graphiti", mock_graphiti_cls),
        patch("redislite.async_falkordb_client.AsyncFalkorDB", return_value=MagicMock()),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

    warn_msgs = [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING]
    assert any("[gralkor] warmup failed" in m and "boom" in m for m in warn_msgs), warn_msgs


@pytest.mark.asyncio
async def test_removes_stale_redislite_resume_cache_before_falkordb(tmp_path, monkeypatch):
    """Reifies `server-falkordb-bootstrap` (TEST_TREES.md). Lifespan must
    unlink any existing `gralkor.db.settings` immediately before constructing
    AsyncFalkorDB, so a stale cache from a prior boot can't trap redislite
    into reconnecting to a dead socket. Contract: see
    `tests/test_redislite_resume_trap.py`."""
    data_dir = tmp_path / "db"
    data_dir.mkdir()
    settings_path = data_dir / "gralkor.db.settings"
    settings_path.write_text('{"pidfile": "stale", "unixsocket": "stale"}')
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(data_dir))

    observed_settings_existed: list[bool] = []

    def _record_and_return(_db_path):
        observed_settings_existed.append(settings_path.exists())
        return MagicMock()

    mock_graphiti_instance = _make_graphiti_mock()
    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", MagicMock()),
        patch("main.Graphiti", MagicMock(return_value=mock_graphiti_instance)),
        patch("redislite.async_falkordb_client.AsyncFalkorDB", side_effect=_record_and_return),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

    assert observed_settings_existed == [False], (
        "AsyncFalkorDB was called while a stale gralkor.db.settings still "
        "existed — redislite would reconnect to the cached dead socket "
        "and fail. Lifespan must unlink the file first."
    )
