"""Tree: /health endpoint."""

from __future__ import annotations

import re

import pytest
from unittest.mock import AsyncMock


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_responds_in_constant_time_independent_of_graph_size(
        self, client, mock_graphiti
    ):
        mock_graphiti.driver.execute_query = AsyncMock(return_value=[[{"1": 1}]])

        resp = await client.get("/health")

        assert resp.status_code == 200
        queries = [
            call.args[0] if call.args else call.kwargs.get("query", "")
            for call in mock_graphiti.driver.execute_query.call_args_list
        ]
        for q in queries:
            assert not re.search(r"\bMATCH\b", q, re.IGNORECASE), (
                f"/health must not scan the graph; saw query: {q!r}"
            )
            assert not re.search(r"\bcount\s*\(", q, re.IGNORECASE), (
                f"/health must not aggregate graph data; saw query: {q!r}"
            )

    class TestWhenTheFalkorDbDriverAnswersACheapProbe:
        @pytest.mark.asyncio
        async def test_returns_200(self, client, mock_graphiti):
            mock_graphiti.driver.execute_query = AsyncMock(return_value=[[{"1": 1}]])

            resp = await client.get("/health")

            assert resp.status_code == 200

    class TestIfTheProbeRaisesOrTimesOut:
        @pytest.mark.asyncio
        async def test_returns_503_with_an_error_detail(self, client, mock_graphiti):
            mock_graphiti.driver.execute_query = AsyncMock(
                side_effect=Exception("connection refused")
            )

            resp = await client.get("/health")

            assert resp.status_code == 503
            body = resp.json()
            assert "connection refused" in body["detail"]
