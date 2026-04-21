"""Reifies Operations > upstream-idle-survival.

Tree:
  when an endpoint is called after the server has been idle long enough for
    its pooled upstream connection to have gone away
    then the endpoint still responds within its normal latency envelope
      (in particular, /recall fits inside the 5 s Elixir client budget —
       see Timeouts > client-timeouts)

The mechanism that makes this true has three parts:
  - transport retries >= 1 (dead pooled socket → transparent reconnect)
  - connect timeout short enough that failure + reconnect fit inside /recall's 5 s
  - one configured genai.Client threaded into embedder, LLM, and reranker,
    so the tree's scope preamble ("every Gemini-backed graphiti helper") holds.
"""

from __future__ import annotations

import main as main_mod


def test_shared_genai_client_retries_on_connection_failure():
    client = main_mod._build_genai_client()
    assert client._api_client._async_httpx_client._transport._pool._retries >= 1


def test_shared_genai_client_connect_timeout_fits_inside_recall_budget():
    client = main_mod._build_genai_client()
    connect = client._api_client._async_httpx_client.timeout.connect
    assert connect is not None and connect <= 3.0


def test_shared_genai_client_is_used_by_every_gemini_backed_helper():
    gc = main_mod._build_genai_client()
    cfg = {"llm": {"provider": "gemini"}, "embedder": {"provider": "gemini"}}
    llm = main_mod._build_llm_client(cfg, genai_client=gc)
    emb = main_mod._build_embedder(cfg, genai_client=gc)
    rer = main_mod._build_cross_encoder(cfg, genai_client=gc)
    assert llm.client is gc
    assert emb.client is gc
    assert rer.client is gc
