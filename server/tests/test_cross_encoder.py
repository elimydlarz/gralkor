"""Tests for _build_cross_encoder provider selection."""

from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """Ensure OPENAI_API_KEY is unset unless a test explicitly sets it."""
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)


class TestBuildCrossEncoder:
    """cross-encoder-selection test tree."""

    def test_gemini_provider_uses_gemini_reranker(self, monkeypatch):
        """when llm provider is gemini then uses GeminiRerankerClient."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)
        mock_client = MagicMock()

        with patch(
            "main.GeminiRerankerClient" if False else
            "graphiti_core.cross_encoder.gemini_reranker_client.GeminiRerankerClient",
            return_value=mock_client,
        ) as mock_cls:
            from main import _build_cross_encoder

            result = _build_cross_encoder({"llm": {"provider": "gemini"}})

        assert result is mock_client

    def test_gemini_default_uses_gemini_reranker(self, monkeypatch):
        """when llm provider is not specified (defaults to gemini) then uses GeminiRerankerClient."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)

        with patch(
            "graphiti_core.cross_encoder.gemini_reranker_client.GeminiRerankerClient",
            return_value=MagicMock(),
        ):
            from main import _build_cross_encoder

            result = _build_cross_encoder({})

        assert result is not None

    def test_non_gemini_with_openai_key_uses_openai_reranker(self, monkeypatch):
        """when llm provider is not gemini and OPENAI_API_KEY is set then uses OpenAIRerankerClient."""
        monkeypatch.setenv("OPENAI_API_KEY", "sk-test-key")
        mock_client = MagicMock()

        with patch(
            "graphiti_core.cross_encoder.openai_reranker_client.OpenAIRerankerClient",
            return_value=mock_client,
        ):
            from main import _build_cross_encoder

            result = _build_cross_encoder({"llm": {"provider": "anthropic"}})

        assert result is mock_client

    def test_non_gemini_without_openai_key_returns_none(self, monkeypatch):
        """when llm provider is not gemini and OPENAI_API_KEY is not set then cross_encoder is None."""
        monkeypatch.delenv("OPENAI_API_KEY", raising=False)

        from main import _build_cross_encoder

        result = _build_cross_encoder({"llm": {"provider": "anthropic"}})

        assert result is None
