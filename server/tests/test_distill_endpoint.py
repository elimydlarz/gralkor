"""Tree: POST /distill endpoint.

Thin wrapper: turns → episode_messages → format_transcript → episode_body.
"""

from __future__ import annotations


async def test_returns_episode_body(client, mock_graphiti):
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "investigated"}

    resp = await client.post(
        "/distill",
        json={
            "turns": [
                {
                    "user_query": "what is the weather?",
                    "events": [
                        {"kind": "thinking", "text": "let me check"},
                        {"kind": "tool_use", "text": "weather_lookup"},
                    ],
                    "assistant_answer": "sunny",
                }
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()["episode_body"]
    assert "User: what is the weather?" in body
    assert "Assistant: (behaviour: investigated)" in body
    assert "Assistant: sunny" in body


async def test_handles_text_only_turn(client, mock_graphiti):
    resp = await client.post(
        "/distill",
        json={
            "turns": [
                {"user_query": "hi", "events": [], "assistant_answer": "hello"}
            ]
        },
    )
    assert resp.status_code == 200
    assert resp.json()["episode_body"] == "User: hi\nAssistant: hello"


async def test_silently_drops_distill_failures(client, mock_graphiti):
    mock_graphiti.llm_client.generate_response.side_effect = RuntimeError("boom")

    resp = await client.post(
        "/distill",
        json={
            "turns": [
                {
                    "user_query": "q",
                    "events": [{"kind": "thinking", "text": "t"}],
                    "assistant_answer": "a",
                }
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()["episode_body"]
    assert "(behaviour:" not in body
    assert "User: q" in body
    assert "Assistant: a" in body


async def test_bearer_auth_required(client, monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "t")
    resp = await client.post("/distill", json={"turns": []})
    assert resp.status_code == 401
