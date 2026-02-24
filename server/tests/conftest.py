"""Shared fixtures for Gralkor server functional tests."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient


# ── Factory helpers ──────────────────────────────────────────


def make_episode(
    uuid: str = "ep-001",
    name: str = "test episode",
    content: str = "hello world",
    source_description: str = "test source",
    group_id: str = "grp-1",
    created_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        uuid=uuid,
        name=name,
        content=content,
        source_description=source_description,
        group_id=group_id,
        created_at=created_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
    )


def make_edge(
    uuid: str = "edge-001",
    name: str = "KNOWS",
    fact: str = "Alice knows Bob",
    valid_at: datetime | None = None,
    invalid_at: datetime | None = None,
    created_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        uuid=uuid,
        name=name,
        fact=fact,
        valid_at=valid_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
        invalid_at=invalid_at,
        created_at=created_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
    )


def make_entity(
    uuid: str = "node-001",
    name: str = "Alice",
    summary: str = "A person",
    group_id: str = "grp-1",
    created_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        uuid=uuid,
        name=name,
        summary=summary,
        group_id=group_id,
        created_at=created_at or datetime(2025, 1, 1, tzinfo=timezone.utc),
    )


# ── Fixtures ─────────────────────────────────────────────────


@pytest.fixture
def mock_graphiti():
    """AsyncMock standing in for the Graphiti singleton."""
    g = AsyncMock()
    g.driver = Mock()

    # Default return values (tests can override)
    episode_result = SimpleNamespace(episode=make_episode())
    g.add_episode.return_value = episode_result
    g.retrieve_episodes.return_value = [make_episode()]
    g.remove_episode.return_value = None
    g.search.return_value = [make_edge()]
    g.search_.return_value = SimpleNamespace(nodes=[make_entity()])
    g.build_indices_and_constraints.return_value = None
    g.build_communities.return_value = (["community-1"], ["edge-1", "edge-2"])
    g.close.return_value = None

    return g


@pytest_asyncio.fixture
async def client(mock_graphiti):
    """Async HTTP client wired to the real FastAPI app with mocked Graphiti."""
    import main as main_mod

    original = main_mod.graphiti
    main_mod.graphiti = mock_graphiti
    transport = ASGITransport(app=main_mod.app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    main_mod.graphiti = original
