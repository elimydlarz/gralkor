"""Reifies gralkor/TEST_TREES.md > Retry ownership > Vertex-upstream class.

The google-genai SDK (L6.5) owns retries for HTTP 408, 429, 500, 502, 503, 504
with a bounded attempts × backoff × per-attempt-timeout config. No layer above
the SDK retries this class.

These tests assert the server's factory produces a client whose HttpOptions
carry the intended retry policy and per-attempt timeout — so future drift
(library upgrade or accidental edit) fails fast rather than silently changing
behaviour.
"""

from __future__ import annotations

import main as main_mod


def test_genai_client_http_options_per_attempt_timeout_is_set():
    """L6.5 per-attempt deadline. 10_000 ms leaves room for two sequential
    L6 calls under the 25 s /recall budget and the 30 s /tools/memory_search
    budget (RETRY_PLAN.md Phase 3.2)."""
    client = main_mod._build_genai_client()
    http_options = client._api_client._http_options

    assert http_options.timeout == 10_000


def test_genai_client_http_options_retry_attempts_is_bounded_to_two():
    """Two attempts bounds the worst case at ~2 × (timeout + max_delay).
    More attempts produce more Vertex load without commensurate success
    odds during sustained throttling."""
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert retry_options is not None
    assert retry_options.attempts == 2


def test_genai_client_http_options_retry_backoff_is_tight():
    """Initial delay 1 s, max delay 3 s — fits inside the adapter per-endpoint
    budgets. Library defaults (1 s init, 60 s cap) would exceed every
    client-side window we maintain."""
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert retry_options.initial_delay == 1.0
    assert retry_options.max_delay == 3.0
    assert retry_options.exp_base == 2


def test_genai_client_http_options_retry_covers_rate_limit_and_server_errors():
    """The SDK must retry every status code we treat as Vertex-upstream:
    408 (request timeout), 429 (rate limit), 500/502/503/504 (server errors).
    Removing any would shift that class's ownership to a layer above —
    violating the retry-ownership invariant."""
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert set(retry_options.http_status_codes) == {408, 429, 500, 502, 503, 504}
