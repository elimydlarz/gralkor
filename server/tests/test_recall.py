"""Tree: POST /recall endpoint.

Composes fast search + format + interpret + XML wrap.
Empty search → {"memory_block": ""}. Bearer auth required.
"""

from __future__ import annotations

from datetime import datetime, timezone

from .conftest import make_edge


async def test_returns_empty_block_when_no_facts(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    resp = await client.post(
        "/recall",
        json={"group_id": "grp", "query": "q", "conversation_messages": [], "max_results": 10},
    )
    assert resp.status_code == 200
    assert resp.json() == {"memory_block": ""}
    mock_graphiti.llm_client.generate_response.assert_not_awaited()


async def test_interprets_and_wraps_when_facts_exist(client, mock_graphiti):
    mock_graphiti.search.return_value = [
        make_edge(fact="Alice knows Bob", created_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    ]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "Alice and Bob are colleagues."}

    resp = await client.post(
        "/recall",
        json={
            "group_id": "grp",
            "query": "who is bob",
            "conversation_messages": [{"role": "user", "text": "who is bob?"}],
            "max_results": 10,
        },
    )
    assert resp.status_code == 200
    block = resp.json()["memory_block"]
    assert block.startswith('<gralkor-memory trust="untrusted">')
    assert block.endswith("</gralkor-memory>")
    assert "Facts:" in block
    assert "Alice knows Bob" in block
    assert "Interpretation:" in block
    assert "Alice and Bob are colleagues." in block
    assert "Search memory (up to 3 times, diverse queries)" in block


async def test_uses_fast_mode(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    await client.post(
        "/recall",
        json={"group_id": "grp", "query": "q", "conversation_messages": [], "max_results": 5},
    )
    mock_graphiti.search.assert_awaited_once()
    call_kwargs = mock_graphiti.search.await_args.kwargs
    assert call_kwargs["num_results"] == 5


async def test_sanitizes_hyphenated_group_id(client, mock_graphiti):
    mock_graphiti.search.return_value = []
    await client.post(
        "/recall",
        json={
            "group_id": "my-agent-id",
            "query": "q",
            "conversation_messages": [],
            "max_results": 10,
        },
    )
    call_kwargs = mock_graphiti.search.await_args.kwargs
    assert call_kwargs["group_ids"] == ["my_agent_id"]


async def test_strips_gralkor_memory_from_conversation(client, mock_graphiti):
    mock_graphiti.search.return_value = [make_edge(fact="A")]
    mock_graphiti.llm_client.generate_response.return_value = {"text": "ok"}

    await client.post(
        "/recall",
        json={
            "group_id": "grp",
            "query": "q",
            "conversation_messages": [
                {"role": "user", "text": "<gralkor-memory>leaked</gralkor-memory>actual question"}
            ],
            "max_results": 10,
        },
    )
    llm_call = mock_graphiti.llm_client.generate_response.await_args
    interpret_context = llm_call.args[0][1].content
    assert "leaked" not in interpret_context
    assert "actual question" in interpret_context


async def test_bearer_auth_required(client, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "t")
    resp = await client.post(
        "/recall",
        json={"group_id": "g", "query": "q", "conversation_messages": [], "max_results": 1},
    )
    assert resp.status_code == 401
