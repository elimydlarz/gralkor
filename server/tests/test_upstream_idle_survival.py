"""Reifies Operations > upstream-idle-survival.

Tree:
  when an endpoint is called after the server has been idle long enough for
    its pooled upstream connection to have gone away
    then the endpoint still responds within its normal latency envelope
      (in particular, /recall fits inside the adapter /recall budget —
       see Timeouts > client-timeouts and Retry ownership)

The mechanism that makes this true has two parts under the retry-ownership
doctrine (see TEST_TREES.md > Retry ownership):

  - the google-genai SDK (L6.5) retries on 408/429/500/502/503/504 with the
    configured HttpOptions(retry_options=HttpRetryOptions(...)) — a dead
    pooled socket surfaces as a 5xx/connection error and the SDK reconnects
    transparently inside its own retry loop. Per-attempt timeout is bounded
    by HttpOptions.timeout so each attempt fails fast rather than hanging.

  - one configured genai.Client is threaded into embedder, LLM, and
    reranker, so the tree's scope preamble ("every Gemini-backed graphiti
    helper") holds.

httpx is no longer configured by the server (Phase 2.2 of RETRY_PLAN.md
removed the client_args/async_client_args overrides); the SDK's
per-attempt timeout propagates to httpx_client.send(..., timeout=...) and
overrides any client-level defaults.
"""

from __future__ import annotations

import main as main_mod


def test_shared_genai_client_sdk_retry_is_configured():
    """SDK-layer retry is what absorbs a dead pooled socket now — the old
    httpx transport-retries=1 knob was removed in Phase 2.2."""
    client = main_mod._build_genai_client()
    retry_options = client._api_client._http_options.retry_options

    assert retry_options is not None
    assert retry_options.attempts >= 2


def test_shared_genai_client_per_attempt_timeout_fits_inside_recall_budget():
    """Per-attempt timeout, enforced by httpx via HttpOptions.timeout,
    must fit under the adapter's /recall budget so a single bad attempt
    does not exhaust the client-side window."""
    client = main_mod._build_genai_client()
    per_attempt_ms = client._api_client._http_options.timeout

    assert per_attempt_ms is not None
    # Adapter /recall budget post-Phase-3.2 is 25 s; a single L6 attempt
    # should fit well under that (two sequential L6 calls per recall).
    assert per_attempt_ms <= 15_000


def test_shared_genai_client_is_used_by_every_gemini_backed_helper():
    gc = main_mod._build_genai_client()
    cfg = {"llm": {"provider": "gemini"}, "embedder": {"provider": "gemini"}}
    llm = main_mod._build_llm_client(cfg, genai_client=gc)
    emb = main_mod._build_embedder(cfg, genai_client=gc)
    rer = main_mod._build_cross_encoder(cfg, genai_client=gc)
    assert llm.client is gc
    assert emb.client is gc
    assert rer.client is gc
