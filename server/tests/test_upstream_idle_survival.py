"""Reifies Operations > upstream-idle-survival.

Tree:
  when an endpoint is called after the server has been idle long enough for
    its pooled upstream connection to have gone away
    then the endpoint still responds within its normal latency envelope

The tree is about the observable outcome, not the mechanism. Dead-socket
recovery happens at httpx's connection pool layer (a stale connection is
dropped and a fresh one opened on the next send) — not in the SDK or in
the server. This file therefore verifies the structural prerequisite
that makes recovery uniform across every Gemini-backed helper: the same
genai.Client is threaded into embedder, LLM, and reranker.
"""

from __future__ import annotations

import main as main_mod


def test_shared_genai_client_is_used_by_every_gemini_backed_helper():
    gc = main_mod._build_genai_client()
    cfg = {"llm": {"provider": "gemini"}, "embedder": {"provider": "gemini"}}
    llm = main_mod._build_llm_client(cfg, genai_client=gc)
    emb = main_mod._build_embedder(cfg, genai_client=gc)
    rer = main_mod._build_cross_encoder(cfg, genai_client=gc)
    assert llm.client is gc
    assert emb.client is gc
    assert rer.client is gc
