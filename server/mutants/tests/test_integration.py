"""Integration tests that exercise a real FalkorDBLite database.

These tests prove the native binary is installable and functional on the host
platform — something the unit tests cannot verify because they mock everything.

The lifespan test goes through the real main.py startup path with zero mocks:
real config loading, real LLM/embedder client construction, real FalkorDBLite,
real FalkorDriver, real Graphiti instance, and real graph index creation.
(The LLM/embedder clients construct fine without API keys — keys are only
needed when actually calling the LLM, which these tests don't do.)

No LLM API keys required. No Docker required.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient
from redislite.async_falkordb_client import AsyncFalkorDB


@pytest.fixture
def db(tmp_path):
    """Create a real embedded FalkorDBLite database in a temp directory."""
    db_path = str(tmp_path / "test.db")
    return AsyncFalkorDB(db_path)


@pytest.mark.asyncio
async def test_falkordblite_binary_loads():
    """The falkordblite native binary can be imported."""
    from redislite.async_falkordb_client import AsyncFalkorDB as cls

    assert cls is not None


@pytest.mark.asyncio
async def test_create_embedded_database(db):
    """An embedded FalkorDBLite database can be created and pinged."""
    graph = db.select_graph("test_graph")
    assert graph is not None


@pytest.mark.asyncio
async def test_write_and_read_graph(db):
    """Data written to the graph can be read back."""
    graph = db.select_graph("test_graph")

    await graph.query("CREATE (:Person {name: 'Alice', role: 'engineer'})")

    result = await graph.query("MATCH (p:Person {name: 'Alice'}) RETURN p.name, p.role")
    assert len(result.result_set) == 1
    assert result.result_set[0][0] == "Alice"
    assert result.result_set[0][1] == "engineer"


@pytest.mark.asyncio
async def test_write_and_search_relationship(db):
    """Relationships can be created and queried."""
    graph = db.select_graph("test_graph")

    await graph.query(
        "CREATE (:Person {name: 'Alice'})-[:KNOWS]->(:Person {name: 'Bob'})"
    )

    result = await graph.query(
        "MATCH (a:Person)-[:KNOWS]->(b:Person) RETURN a.name, b.name"
    )
    assert len(result.result_set) == 1
    assert result.result_set[0][0] == "Alice"
    assert result.result_set[0][1] == "Bob"


@pytest.mark.asyncio
async def test_falkordriver_with_embedded_db(db):
    """FalkorDriver (used by Graphiti) works with an embedded FalkorDBLite instance."""
    from graphiti_core.driver.falkordb_driver import FalkorDriver

    driver = FalkorDriver(falkor_db=db)
    assert driver is not None


@pytest.mark.asyncio
async def test_lifespan_creates_real_embedded_db(tmp_path, monkeypatch):
    """The real main.py lifespan starts up with zero mocks.

    Real config loading, real LLM/embedder client construction, real
    FalkorDBLite, real FalkorDriver, real Graphiti, real index creation.
    """
    monkeypatch.delenv("FALKORDB_URI", raising=False)
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))

    import main as main_mod

    app = MagicMock()
    async with main_mod.lifespan(app):
        graphiti = main_mod.graphiti
        assert graphiti is not None
        assert graphiti.driver is not None

        # Write data through the real Graphiti driver → real FalkorDBLite
        await graphiti.driver.execute_query(
            "CREATE (:Person {name: 'Alice', role: 'engineer'})"
        )

        # Read it back
        rows, _, _ = await graphiti.driver.execute_query(
            "MATCH (p:Person {name: 'Alice'}) RETURN p.role"
        )
        assert len(rows) == 1
        assert rows[0]["p.role"] == "engineer"

        # Health endpoint works through the real FastAPI app
        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/health")
            assert resp.status_code == 200
            assert resp.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_ingest_messages_with_thinking_distillation():
    """Full path: POST /ingest-messages → format transcript → distill thinking → add_episode.

    Uses real FastAPI app and HTTP layer. Mocks Graphiti (LLM + graph ops) to
    avoid needing API keys or a running database, while still exercising the
    complete server request handling, transcript formatting, and distillation.
    """
    from types import SimpleNamespace

    import main as main_mod

    # Set up mock Graphiti with LLM client for distillation
    mock_graphiti = AsyncMock()
    mock_graphiti.llm_client = AsyncMock()
    mock_graphiti.llm_client.generate_response = AsyncMock(
        return_value={"content": "Investigated and resolved the auth bug"}
    )
    mock_graphiti.add_episode.return_value = SimpleNamespace(
        episode=SimpleNamespace(
            uuid="ep-func-1",
            name="test-conversation",
            content="",  # will be overwritten by assertion on call args
            source_description="functional-test",
            group_id="test-group",
            created_at=None,
        )
    )

    original = main_mod.graphiti
    main_mod.graphiti = mock_graphiti
    try:
        transport = ASGITransport(app=main_mod.app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/ingest-messages", json={
                "name": "test-conversation",
                "source_description": "functional-test",
                "group_id": "test-group",
                "idempotency_key": "integration-distillation-test",
                "messages": [
                    {"role": "user", "content": [{"type": "text", "text": "Fix the auth bug"}]},
                    {"role": "assistant", "content": [
                        {"type": "thinking", "text": "Let me check the auth module..."},
                        {"type": "text", "text": "Fixed the null check in auth.ts"},
                    ]},
                ],
            })

            assert resp.status_code == 200

            # Verify what was passed to graphiti.add_episode
            call_kwargs = mock_graphiti.add_episode.call_args.kwargs
            body = call_kwargs["episode_body"]

            # Distilled behaviour appears
            assert "Assistant: (behaviour: Investigated and resolved the auth bug)" in body
            # Formatted transcript appears
            assert "User: Fix the auth bug" in body
            assert "Assistant: Fixed the null check in auth.ts" in body
            # Raw thinking does NOT leak
            assert "Let me check the auth module" not in body
    finally:
        main_mod.graphiti = original
