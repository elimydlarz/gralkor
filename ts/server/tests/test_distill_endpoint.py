"""Tree: POST /distill endpoint.

Thin wrapper: turns (each a list of canonical Messages) → format_transcript
→ episode_body.
"""

from __future__ import annotations


async def test_returns_episode_body(client, mock_graphiti):
    mock_graphiti.llm_client.generate_response.return_value = {"behaviour": "investigated"}

    resp = await client.post(
        "/distill",
        json={
            "turns": [
                [
                    {"role": "user", "content": "what is the weather?"},
                    {"role": "behaviour", "content": "thought: let me check"},
                    {"role": "behaviour", "content": "tool weather_lookup() → sunny"},
                    {"role": "assistant", "content": "sunny"},
                ]
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
                [
                    {"role": "user", "content": "hi"},
                    {"role": "assistant", "content": "hello"},
                ]
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
                [
                    {"role": "user", "content": "q"},
                    {"role": "behaviour", "content": "thought: x"},
                    {"role": "assistant", "content": "a"},
                ]
            ]
        },
    )
    assert resp.status_code == 200
    body = resp.json()["episode_body"]
    assert "(behaviour:" not in body
    assert "User: q" in body
    assert "Assistant: a" in body
