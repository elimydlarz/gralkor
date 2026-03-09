"""Thin FastAPI server wrapping graphiti-core for the Gralkor plugin."""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

import yaml
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel



from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.edges import EntityEdge
from graphiti_core.nodes import CommunityNode, EntityNode, EpisodicNode, EpisodeType, Node
from graphiti_core.llm_client import LLMConfig


# ── Config ────────────────────────────────────────────────────


def _load_config() -> dict:
    path = os.getenv("CONFIG_PATH", "/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _build_llm_client(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "openai")
    model = cfg.get("llm", {}).get("model")
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def _build_embedder(cfg: dict):
    provider = cfg.get("embedder", {}).get("provider", "openai")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def _log_falkordblite_diagnostics(error: Exception) -> None:
    """Log diagnostic info when FalkorDBLite fails to start."""
    import platform
    import subprocess

    print(f"[gralkor] FalkorDBLite startup failed: {error}", flush=True)
    print(f"[gralkor] Platform: {platform.platform()}, arch: {platform.machine()}", flush=True)
    try:
        from redislite import __redis_executable__, __falkordb_module__

        for label, path in [("redis-server", __redis_executable__), ("FalkorDB module", __falkordb_module__)]:
            if not path:
                print(f"[gralkor] {label}: not found", flush=True)
                continue
            print(f"[gralkor] {label}: {path}", flush=True)
            for cmd in [[path, "--version"] if "redis" in label else [], ["file", path], ["ldd", path]]:
                if not cmd:
                    continue
                try:
                    r = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
                    out = r.stdout.strip() or r.stderr.strip()
                    if out:
                        for line in out.split("\n"):
                            print(f"[gralkor]   {line}", flush=True)
                except FileNotFoundError:
                    pass
                except Exception:
                    pass
    except Exception as diag_err:
        print(f"[gralkor] Diagnostic collection failed: {diag_err}", flush=True)


# ── Graphiti singleton ────────────────────────────────────────

graphiti: Graphiti | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global graphiti
    cfg = _load_config()

    falkordb_uri = os.getenv("FALKORDB_URI")

    if falkordb_uri:
        # Legacy Docker mode: external FalkorDB via TCP
        stripped = falkordb_uri.split("://", 1)[-1]
        if ":" in stripped:
            host, port_str = stripped.rsplit(":", 1)
            port = int(port_str)
        else:
            host, port = stripped, 6379
        driver = FalkorDriver(host=host, port=port)
    else:
        # Default: embedded FalkorDBLite (no Docker needed)
        import logging
        logging.getLogger("redislite").setLevel(logging.DEBUG)

        from redislite.async_falkordb_client import AsyncFalkorDB

        data_dir = os.getenv("FALKORDB_DATA_DIR", "./data/falkordb")
        os.makedirs(data_dir, exist_ok=True)
        db_path = os.path.join(data_dir, "gralkor.db")
        try:
            db = AsyncFalkorDB(db_path)
        except Exception as e:
            _log_falkordblite_diagnostics(e)
            raise
        driver = FalkorDriver(falkor_db=db)

    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=_build_llm_client(cfg),
        embedder=_build_embedder(cfg),
    )
    await graphiti.build_indices_and_constraints()
    yield
    await graphiti.close()


app = FastAPI(title="Gralkor Graphiti Server", lifespan=lifespan)


# ── Rate-limit passthrough ───────────────────────────────────


def _find_rate_limit_error(exc: Exception) -> Exception | None:
    """Walk exception chain to find an upstream rate-limit error."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        # Match openai.RateLimitError, anthropic.RateLimitError, etc.
        if type(current).__name__ == "RateLimitError" or (
            hasattr(current, "status_code") and getattr(current, "status_code", None) == 429
        ):
            return current
        current = current.__cause__ or current.__context__
    return None


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        rl = _find_rate_limit_error(exc)
        if rl is not None:
            msg = str(rl).split("\n")[0][:200]
            return JSONResponse(status_code=429, content={"detail": msg})
        raise


# ── Request / response models ────────────────────────────────


class AddEpisodeRequest(BaseModel):
    name: str
    episode_body: str
    source_description: str
    group_id: str
    reference_time: str | None = None


class SearchRequest(BaseModel):
    query: str
    group_ids: list[str]
    num_results: int = 10


class ClearRequest(BaseModel):
    group_id: str


# ── Serializers ───────────────────────────────────────────────


def _ts(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _serialize_fact(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "created_at": _ts(edge.created_at),
    }


def _serialize_node(node: EntityNode) -> dict[str, Any]:
    return {
        "uuid": node.uuid,
        "name": node.name,
        "summary": node.summary,
        "group_id": node.group_id,
        "created_at": _ts(node.created_at),
    }


def _serialize_episode(ep: EpisodicNode) -> dict[str, Any]:
    return {
        "uuid": ep.uuid,
        "name": ep.name,
        "content": ep.content,
        "source_description": ep.source_description,
        "group_id": ep.group_id,
        "created_at": _ts(ep.created_at),
    }


def _serialize_community(c: CommunityNode) -> dict[str, Any]:
    return {
        "uuid": c.uuid,
        "name": c.name,
        "summary": c.summary,
        "group_id": c.group_id,
        "created_at": _ts(c.created_at),
    }


# ── Endpoints ─────────────────────────────────────────────────


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/episodes")
async def add_episode(req: AddEpisodeRequest):
    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    result = await graphiti.add_episode(
        name=req.name,
        episode_body=req.episode_body,
        source_description=req.source_description,
        group_id=req.group_id,
        reference_time=ref_time,
        source=EpisodeType.message,
    )
    # add_episode returns AddEpisodeResults; find the episode node
    episode = result.episode
    return _serialize_episode(episode)


@app.get("/episodes")
async def get_episodes(group_id: str, limit: int = 10):
    episodes = await graphiti.retrieve_episodes(
        reference_time=datetime.now(timezone.utc),
        last_n=limit,
        group_ids=[group_id],
    )
    return [_serialize_episode(ep) for ep in episodes]


@app.delete("/episodes/{uuid}")
async def delete_episode(uuid: str):
    await graphiti.remove_episode(uuid)
    return Response(status_code=204)


def _sanitize_query(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("`", " ")


@app.post("/search")
async def search(req: SearchRequest):
    edges = await graphiti.search(
        query=_sanitize_query(req.query),
        group_ids=req.group_ids,
        num_results=req.num_results,
    )
    return {
        "facts": [_serialize_fact(e) for e in edges],
        "nodes": [],
        "episodes": [],
        "communities": [],
    }


@app.delete("/edges/{uuid}")
async def delete_edge(uuid: str):
    driver = graphiti.driver
    edge = await EntityEdge.get_by_uuid(driver, uuid)
    await edge.delete(driver)
    return Response(status_code=204)


@app.post("/clear")
async def clear_graph(req: ClearRequest):
    driver = graphiti.driver
    await Node.delete_by_group_id(driver, req.group_id)
    return {"deleted": True}


@app.post("/build-indices")
async def build_indices():
    await graphiti.build_indices_and_constraints()
    return {"status": "ok"}


@app.post("/build-communities")
async def build_communities(req: ClearRequest):
    communities, edges = await graphiti.build_communities(
        group_ids=[req.group_id],
    )
    return {"communities": len(communities), "edges": len(edges)}
