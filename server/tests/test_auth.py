"""Tree: auth.

Bearer-token dependency. AUTH_TOKEN env gate, /health exempt, 401s on missing/bad.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def auth_env(monkeypatch):
    monkeypatch.setenv("AUTH_TOKEN", "test-token")


@pytest.fixture
def no_auth_env(monkeypatch):
    monkeypatch.delenv("AUTH_TOKEN", raising=False)


async def test_health_exempt_when_auth_set(client, auth_env):
    resp = await client.get("/health")
    assert resp.status_code == 200


async def test_health_exempt_when_auth_unset(client, no_auth_env):
    resp = await client.get("/health")
    assert resp.status_code == 200


async def test_protected_endpoint_rejects_missing_header(client, auth_env, mock_graphiti):
    resp = await client.post("/search", json={"query": "q", "group_ids": ["g"]})
    assert resp.status_code == 401


async def test_protected_endpoint_rejects_wrong_scheme(client, auth_env, mock_graphiti):
    resp = await client.post(
        "/search",
        json={"query": "q", "group_ids": ["g"]},
        headers={"Authorization": "Basic dGVzdA=="},
    )
    assert resp.status_code == 401


async def test_protected_endpoint_rejects_wrong_token(client, auth_env, mock_graphiti):
    resp = await client.post(
        "/search",
        json={"query": "q", "group_ids": ["g"]},
        headers={"Authorization": "Bearer wrong"},
    )
    assert resp.status_code == 401


async def test_protected_endpoint_accepts_correct_token(client, auth_env, mock_graphiti):
    resp = await client.post(
        "/search",
        json={"query": "q", "group_ids": ["g"]},
        headers={"Authorization": "Bearer test-token"},
    )
    assert resp.status_code == 200


async def test_bypass_when_auth_token_unset(client, no_auth_env, mock_graphiti):
    resp = await client.post("/search", json={"query": "q", "group_ids": ["g"]})
    assert resp.status_code == 200
