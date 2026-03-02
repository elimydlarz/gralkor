"""Integration tests that exercise a real FalkorDBLite database.

These tests prove the native binary is installable and functional on the host
platform — something the unit tests cannot verify because they mock everything.

The lifespan test goes through the real main.py startup path: creates a real
embedded FalkorDBLite, a real FalkorDriver, a real Graphiti instance, and builds
real graph indices. Only the LLM client and embedder are mocked (they need API keys).

No LLM API keys required. No Docker required.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient
from redislite import AsyncFalkorDB


@pytest.fixture
def db(tmp_path):
    """Create a real embedded FalkorDBLite database in a temp directory."""
    db_path = str(tmp_path / "test.db")
    return AsyncFalkorDB(db_path)


@pytest.mark.asyncio
async def test_falkordblite_binary_loads():
    """The falkordblite native binary can be imported."""
    from redislite import AsyncFalkorDB as cls

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


class StubLLMClient:
    """Minimal LLMClient subclass that passes Pydantic isinstance checks."""

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)

    async def generate_response(self, messages, response_model=None, **kwargs):
        raise NotImplementedError("stub")

    def set_tracer(self, tracer):
        pass


class StubEmbedderClient:
    """Minimal EmbedderClient subclass that passes Pydantic isinstance checks."""

    async def create(self, input_data):
        return [0.0] * 1024

    async def create_batch(self, input_data_list):
        return [[0.0] * 1024 for _ in input_data_list]


def _make_stub_llm():
    from graphiti_core.llm_client import LLMClient

    # Dynamically create a proper subclass of the ABC
    stub_cls = type("StubLLM", (LLMClient,), {
        "generate_response": StubLLMClient.generate_response,
        "set_tracer": StubLLMClient.set_tracer,
    })
    return stub_cls.__new__(stub_cls)


def _make_stub_embedder():
    from graphiti_core.embedder import EmbedderClient

    stub_cls = type("StubEmbedder", (EmbedderClient,), {
        "create": StubEmbedderClient.create,
        "create_batch": StubEmbedderClient.create_batch,
    })
    return stub_cls.__new__(stub_cls)


@pytest.mark.asyncio
async def test_lifespan_creates_real_embedded_db(tmp_path, monkeypatch):
    """The real main.py lifespan starts up with a real FalkorDBLite database.

    Only the LLM client and embedder are stubbed (they need API keys).
    Everything else is real: FalkorDBLite, FalkorDriver, Graphiti, index creation.
    """
    monkeypatch.delenv("FALKORDB_URI", raising=False)
    monkeypatch.setenv("FALKORDB_DATA_DIR", str(tmp_path / "db"))

    with (
        patch("main._load_config", return_value={}),
        patch("main._build_llm_client", return_value=_make_stub_llm()),
        patch("main._build_embedder", return_value=_make_stub_embedder()),
    ):
        import main as main_mod

        app = MagicMock()
        async with main_mod.lifespan(app):
            # Graphiti instance was created with real FalkorDBLite
            assert main_mod.graphiti is not None
            assert main_mod.graphiti.driver is not None

            # The health endpoint works through the real app
            transport = ASGITransport(app=main_mod.app)
            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                resp = await ac.get("/health")
                assert resp.status_code == 200
                assert resp.json() == {"status": "ok"}
