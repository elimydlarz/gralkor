"""Tests for the lifespan function's FalkorDB initialization."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _make_graphiti_mock(*, has_indices=True):
    """Create a Graphiti mock with configurable index state."""
    mock = AsyncMock()
    if has_indices:
        mock.driver.execute_query.return_value = ([{"label": "Entity"}], [], [])
    else:
        mock.driver.execute_query.return_value = ([], [], [])
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

        mock_driver_cls.assert_called_once()
        assert mock_driver_cls.call_args.kwargs["falkor_db"] is mock_async_db


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
