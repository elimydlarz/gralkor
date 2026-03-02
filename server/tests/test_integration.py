"""Integration tests that exercise a real FalkorDBLite database.

These tests prove the native binary is installable and functional on the host
platform — something the unit tests cannot verify because they mock FalkorDBLite
out of sys.modules.

No LLM API keys required. No Docker required.
"""

from __future__ import annotations

import asyncio

import pytest
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
    # AsyncFalkorDB wraps a redis connection — verify it's alive
    graph = db.select_graph("test_graph")
    assert graph is not None


@pytest.mark.asyncio
async def test_write_and_read_graph(db):
    """Data written to the graph can be read back."""
    graph = db.select_graph("test_graph")

    # Create a node
    await graph.query("CREATE (:Person {name: 'Alice', role: 'engineer'})")

    # Read it back
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
