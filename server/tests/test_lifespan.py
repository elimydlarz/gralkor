"""Tests for the lifespan function's FalkorDB mode switching."""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Ensure FALKORDB_URI is unset unless a test explicitly sets it."""
    monkeypatch.delenv("FALKORDB_URI", raising=False)


def _make_graphiti_mock(*, has_indices=True):
    """Create a Graphiti mock with configurable index state."""
    mock = AsyncMock()
    if has_indices:
        # Simulate existing indices: (records, header, stats)
        mock.driver.execute_query.return_value = ([{"label": "Entity"}], [], [])
    else:
        # No indices yet: empty records list
        mock.driver.execute_query.return_value = ([], [], [])
    return mock


@pytest.mark.asyncio
async def test_embedded_mode_when_no_falkordb_uri(tmp_path, monkeypatch):
    """When FALKORDB_URI is not set, lifespan uses embedded FalkorDBLite."""
    monkeypatch.delenv("FALKORDB_URI", raising=False)
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

        # FalkorDriver should have been called with falkor_db= (embedded mode)
        mock_driver_cls.assert_called_once()
        call_kwargs = mock_driver_cls.call_args
        assert "falkor_db" in call_kwargs.kwargs or (
            len(call_kwargs.args) == 0 and "falkor_db" in call_kwargs.kwargs
        ), f"Expected falkor_db kwarg, got: {call_kwargs}"
        assert call_kwargs.kwargs["falkor_db"] is mock_async_db


@pytest.mark.asyncio
async def test_legacy_mode_when_falkordb_uri_set(monkeypatch):
    """When FALKORDB_URI is set, lifespan connects via TCP (legacy Docker mode)."""
    monkeypatch.setenv("FALKORDB_URI", "redis://myhost:6380")

    mock_driver_cls = MagicMock()
    mock_graphiti_cls = MagicMock()
    mock_graphiti_instance = AsyncMock()
    mock_graphiti_cls.return_value = mock_graphiti_instance

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", mock_driver_cls),
        patch("main.Graphiti", mock_graphiti_cls),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

        # FalkorDriver should have been called with host/port (TCP mode)
        mock_driver_cls.assert_called_once_with(host="myhost", port=6380)


@pytest.mark.asyncio
async def test_legacy_mode_parses_host_only_uri(monkeypatch):
    """When FALKORDB_URI has no port, default to 6379."""
    monkeypatch.setenv("FALKORDB_URI", "redis://falkordb")

    mock_driver_cls = MagicMock()
    mock_graphiti_cls = MagicMock()
    mock_graphiti_instance = AsyncMock()
    mock_graphiti_cls.return_value = mock_graphiti_instance

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=MagicMock()),
        patch("main._build_embedder", return_value=MagicMock()),
        patch("main.FalkorDriver", mock_driver_cls),
        patch("main.Graphiti", mock_graphiti_cls),
    ):
        import main as main_mod
        app = MagicMock()

        async with main_mod.lifespan(app):
            pass

        mock_driver_cls.assert_called_once_with(host="falkordb", port=6379)
