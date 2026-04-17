"""Thin FastAPI server wrapping graphiti-core for the Gralkor plugin."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Literal

import uuid

import yaml
from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, create_model

from pipelines.capture_buffer import CaptureBuffer, CaptureClientError
from pipelines.distill import (
    Turn,
    TurnEvent,
    format_transcript,
    turns_to_episode_messages,
)
from pipelines.formatting import format_fact, format_node
from pipelines.interpret import interpret_facts
from pipelines.message_clean import ConversationMessage



from graphiti_core import Graphiti
from graphiti_core.driver.falkordb_driver import FalkorDriver
from graphiti_core.edges import EntityEdge
from graphiti_core.nodes import EpisodicNode, EpisodeType
from graphiti_core.llm_client import LLMConfig
from graphiti_core.search.search_config_recipes import COMBINED_HYBRID_SEARCH_CROSS_ENCODER


# ── Config ────────────────────────────────────────────────────


def _load_config() -> dict:
    path = os.getenv("CONFIG_PATH", "/app/config.yaml")
    if os.path.exists(path):
        with open(path) as f:
            return yaml.safe_load(f) or {}
    return {}


def _build_llm_client(cfg: dict):
    provider = cfg.get("llm", {}).get("provider", "gemini")
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
    provider = cfg.get("embedder", {}).get("provider", "gemini")
    model = cfg.get("embedder", {}).get("model")

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def _build_cross_encoder(cfg: dict):
    """Match cross-encoder to LLM provider; fall back to OpenAI only if key is present."""
    provider = cfg.get("llm", {}).get("provider", "gemini")

    if provider == "gemini":
        from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
        return GeminiRerankerClient()

    if os.environ.get("OPENAI_API_KEY"):
        from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient
        return OpenAIRerankerClient()

    return None


_TYPE_MAP: dict[str, type] = {
    "string": str,
    "int": int,
    "float": float,
    "bool": bool,
    "datetime": datetime,
}


def _build_type_defs(
    defs: dict[str, Any],
) -> dict[str, type[BaseModel]]:
    """Build Pydantic models from ontology type definitions."""
    models: dict[str, type[BaseModel]] = {}
    for name, defn in defs.items():
        fields: dict[str, Any] = {}
        for attr_name, attr_val in (defn.get("attributes") or {}).items():
            if isinstance(attr_val, str):
                fields[attr_name] = (str, Field(description=attr_val))
            elif isinstance(attr_val, list):
                lit_type = Literal[tuple(attr_val)]  # type: ignore[valid-type]
                fields[attr_name] = (lit_type, Field())
            elif isinstance(attr_val, dict):
                if "enum" in attr_val:
                    lit_type = Literal[tuple(attr_val["enum"])]  # type: ignore[valid-type]
                    fields[attr_name] = (lit_type, Field(description=attr_val.get("description", "")))
                else:
                    py_type = _TYPE_MAP[attr_val["type"]]
                    fields[attr_name] = (py_type, Field(description=attr_val.get("description", "")))
        model = create_model(name, **fields)
        model.__doc__ = defn.get("description", "")
        models[name] = model
    return models


def _build_ontology(
    cfg: dict,
) -> tuple[
    dict[str, type[BaseModel]] | None,
    dict[str, type[BaseModel]] | None,
    dict[tuple[str, str], list[str]] | None,
    list[str] | None,
]:
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    if not entity_types and not edge_types and not edge_type_map:
        return None, None, None

    return entity_types, edge_types, edge_type_map


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
ontology_entity_types: dict[str, type[BaseModel]] | None = None
ontology_edge_types: dict[str, type[BaseModel]] | None = None
ontology_edge_type_map: dict[tuple[str, str], list[str]] | None = None

# Serializes any operation that depends on graphiti.driver pointing at a
# specific FalkorDB named graph. graphiti-core's add_episode() and our
# _ensure_driver_graph() both work by mutating the global graphiti.driver,
# so two concurrent requests for different group_ids can interleave and
# clobber each other's driver state — losing data on writes and returning
# wrong results on reads. Single-user agent semantics make serialization
# acceptable; correctness > throughput here.
_driver_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global graphiti, ontology_entity_types, ontology_edge_types, ontology_edge_type_map
    cfg = _load_config()

    # Embedded FalkorDBLite (no Docker needed)
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
        cross_encoder=_build_cross_encoder(cfg),
    )
    # Only build indices on first boot; skip if they already exist.
    existing = await graphiti.driver.execute_query("CALL db.indexes()")
    if existing and existing[0]:
        print(f"[gralkor] indices already exist ({len(existing[0])} found), skipping build", flush=True)
    else:
        print("[gralkor] building indices and constraints...", flush=True)
        t0_idx = time.monotonic()
        await graphiti.build_indices_and_constraints()
        idx_ms = (time.monotonic() - t0_idx) * 1000
        print(f"[gralkor] indices ready — {idx_ms:.0f}ms", flush=True)

    # Configure logging level: DEBUG in test mode for full data visibility
    log_level = logging.DEBUG if cfg.get("test") else logging.INFO
    logger.setLevel(log_level)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)

    ontology_entity_types, ontology_edge_types, ontology_edge_type_map = _build_ontology(cfg)
    if ontology_entity_types or ontology_edge_types:
        entity_names = list(ontology_entity_types or {})
        edge_names = list(ontology_edge_types or {})
        print(f"[gralkor] ontology: entities={entity_names} edges={edge_names}", flush=True)

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
        # Match openai.RateLimitError, anthropic.RateLimitError, google.genai.errors.ClientError, etc.
        # Note: Google's APIError uses .code, most others use .status_code.
        http_code = getattr(current, "status_code", None) or getattr(current, "code", None)
        if type(current).__name__ == "RateLimitError" or http_code == 429:
            return current
        current = current.__cause__ or current.__context__
    return None


_CREDENTIAL_HINTS = ("api key", "apikey", "credential", "authentication", "expired", "unauthorized")


def _downstream_llm_response(exc: Exception) -> JSONResponse:
    """Map a downstream LLM provider error to an appropriate HTTP response."""
    http_code = int(getattr(exc, "status_code", None) or getattr(exc, "code", None))
    msg = str(exc).split("\n")[0][:200]

    if 400 <= http_code < 500:
        if http_code == 400:
            status = 503 if any(h in msg.lower() for h in _CREDENTIAL_HINTS) else 500
        elif http_code in (401, 403):
            status = 503
        elif http_code in (404, 422):
            status = 500
        else:
            status = 502
    else:
        status = 502

    return JSONResponse(status_code=status, content={"error": "provider error", "detail": msg})


def _find_downstream_llm_error(exc: Exception) -> Exception | None:
    """Walk the exception chain to find a downstream LLM provider error with an HTTP status code."""
    current: Exception | None = exc
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        http_code = getattr(current, "status_code", None) or getattr(current, "code", None)
        if http_code is not None and int(http_code) != 429:
            return current
        current = current.__cause__ or current.__context__
    return None


_DEFAULT_RETRY_AFTER = 5  # seconds


@app.middleware("http")
async def rate_limit_middleware(request, call_next):
    try:
        return await call_next(request)
    except Exception as exc:
        rl = _find_rate_limit_error(exc)
        if rl is not None:
            msg = str(rl).split("\n")[0][:200]
            retry_after = getattr(rl, "retry_after", None)
            if retry_after is None:
                retry_after = _DEFAULT_RETRY_AFTER
            return JSONResponse(
                status_code=429,
                content={"detail": msg},
                headers={"retry-after": str(int(retry_after))},
            )
        llm_err = _find_downstream_llm_error(exc)
        if llm_err is not None:
            return _downstream_llm_response(llm_err)
        raise


# ── Idempotency store ────────────────────────────────────────

# In-memory store: idempotency_key -> serialized_episode
_idempotency_store: dict[str, dict[str, Any]] = {}


def _idempotency_check(key: str) -> dict[str, Any] | None:
    """Return cached episode if key has been seen, else None."""
    return _idempotency_store.get(key)


def _idempotency_store_result(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key."""
    _idempotency_store[key] = result


# ── Request / response models ────────────────────────────────


class AddEpisodeRequest(BaseModel):
    name: str
    episode_body: str
    source_description: str
    group_id: str
    reference_time: str | None = None
    source: str | None = None
    idempotency_key: str


class SearchRequest(BaseModel):
    query: str
    group_ids: list[str]
    num_results: int = 10
    mode: Literal["fast", "slow"] = "fast"


class GroupIdRequest(BaseModel):
    group_id: str


# ── Serializers ───────────────────────────────────────────────


def _ts(dt: datetime | None) -> str | None:
    return dt.isoformat() if dt else None


def _serialize_node(node) -> dict[str, Any]:
    return {
        "uuid": node.uuid,
        "name": node.name,
        "summary": node.summary,
        "group_id": node.group_id,
    }


def _serialize_fact(edge: EntityEdge) -> dict[str, Any]:
    return {
        "uuid": edge.uuid,
        "name": edge.name,
        "fact": edge.fact,
        "group_id": edge.group_id,
        "valid_at": _ts(edge.valid_at),
        "invalid_at": _ts(edge.invalid_at),
        "expired_at": _ts(edge.expired_at),
        "created_at": _ts(edge.created_at),
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


# ── Endpoints ─────────────────────────────────────────────────


logger = logging.getLogger(__name__)


@app.get("/health")
async def health():
    result: dict = {"status": "ok"}

    if graphiti is not None:
        try:
            node_result = await graphiti.driver.execute_query(
                "MATCH (n) RETURN count(n) AS node_count"
            )
            edge_result = await graphiti.driver.execute_query(
                "MATCH ()-[r]->() RETURN count(r) AS edge_count"
            )
            result["graph"] = {
                "connected": True,
                "node_count": node_result[0][0]["node_count"] if node_result and node_result[0] else 0,
                "edge_count": edge_result[0][0]["edge_count"] if edge_result and edge_result[0] else 0,
            }
        except Exception as e:
            result["graph"] = {"connected": False, "error": str(e)}
    else:
        result["graph"] = {"connected": False, "error": "graphiti not initialized"}

    data_dir = os.getenv("FALKORDB_DATA_DIR", "")
    if data_dir:
        result["data_dir"] = data_dir

    return result


@app.post("/episodes")
async def add_episode(req: AddEpisodeRequest):
    cached = _idempotency_check(req.idempotency_key)
    if cached is not None:
        logger.info("[gralkor] add-episode idempotent hit — key:%s uuid:%s",
                    req.idempotency_key, cached.get("uuid"))
        return cached

    logger.info("[gralkor] add-episode — group:%s name:%s bodyChars:%d source:%s",
                req.group_id, req.name, len(req.episode_body), req.source or "message")
    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    episode_type = EpisodeType(req.source) if req.source else EpisodeType.message
    t0 = time.monotonic()
    async with _driver_lock:
        result = await graphiti.add_episode(
            name=req.name,
            episode_body=req.episode_body,
            source_description=req.source_description,
            group_id=_sanitize_group_id(req.group_id),
            reference_time=ref_time,
            source=episode_type,
            entity_types=ontology_entity_types,
            edge_types=ontology_edge_types,
            edge_type_map=ontology_edge_type_map,
            excluded_entity_types=None,
        )
    duration_ms = (time.monotonic() - t0) * 1000
    episode = result.episode
    logger.info("[gralkor] episode added — uuid:%s duration:%.0fms", episode.uuid, duration_ms)
    logger.debug("[gralkor] episode result: %s", _serialize_episode(episode))
    serialized = _serialize_episode(episode)
    _idempotency_store_result(req.idempotency_key, serialized)
    return serialized


def _sanitize_query(query: str) -> str:
    """Strip backticks that cause RediSearch syntax errors.

    graphiti-core's _SEPARATOR_MAP handles most special characters
    but misses backticks. We strip them at the API boundary.
    """
    return query.replace("`", " ")


def _sanitize_group_id(group_id: str) -> str:
    """Replace hyphens with underscores to avoid RediSearch syntax errors.

    graphiti-core embeds group_id verbatim in RediSearch queries like
    (@group_id:"my-hyphen-agent") where hyphens break the parser.
    The plugin-side sanitizeGroupId() handles this at write time, but
    direct API callers (e.g. functional tests) may pass raw hyphens.
    """
    return group_id.replace("-", "_")


def _ensure_driver_graph(group_ids: list[str] | None) -> None:
    """Route graphiti's driver to the correct FalkorDB named graph.

    graphiti-core's add_episode() clones the driver when group_id differs from
    the current database (graphiti.py:887-889), but search() does not.  On fresh
    boot the driver targets 'default_db' — an empty graph — so searches return
    nothing until the first add_episode switches it.  This helper applies the
    same routing for read paths.
    """
    if not group_ids:
        return
    target = group_ids[0]
    if target != graphiti.driver._database:
        try:
            graphiti.driver = graphiti.driver.clone(database=target)
            graphiti.clients.driver = graphiti.driver
            print(f"[gralkor] driver graph routed: {target}", flush=True)
        except Exception as e:
            # Invalid group_id (e.g. hyphens rejected by FalkorDB).  Skip routing
            # so the search runs against the current graph and returns empty results
            # instead of 500ing.
            logger.warning("[gralkor] driver graph routing failed for %s: %s", target, e)


@app.post("/search")
async def search(req: SearchRequest):
    # Sanitize group IDs: hyphens cause RediSearch syntax errors in graphiti-core.
    sanitized = [_sanitize_group_id(g) for g in req.group_ids]
    logger.info("[gralkor] search — mode:%s query:%d chars group_ids:%s num_results:%d",
                req.mode, len(req.query), sanitized, req.num_results)
    # graphiti.add_episode() clones the driver to target the correct FalkorDB
    # named graph (database=group_id), but graphiti.search() does not — it just
    # uses whatever graph the driver currently points at. Before the first
    # add_episode, the driver targets 'default_db' (an empty graph), so all
    # searches return 0 results. Fix: route to the correct graph here.
    t0 = time.monotonic()
    try:
        async with _driver_lock:
            _ensure_driver_graph(sanitized)
            if req.mode == "slow":
                # Cross-encoder + BFS: higher quality, also returns entity node summaries.
                # deepcopy required — COMBINED_HYBRID_SEARCH_CROSS_ENCODER is a module-level
                # constant; mutating .limit directly would corrupt it across requests.
                config = deepcopy(COMBINED_HYBRID_SEARCH_CROSS_ENCODER)
                config.limit = req.num_results
                search_result = await graphiti.search_(
                    query=_sanitize_query(req.query),
                    group_ids=sanitized,
                    config=config,
                )
                edges = search_result.edges
                nodes = search_result.nodes
            else:
                edges = await graphiti.search(
                    query=_sanitize_query(req.query),
                    group_ids=sanitized,
                    num_results=req.num_results,
                )
                nodes = []
    except Exception as e:
        duration_ms = (time.monotonic() - t0) * 1000
        logger.error("[gralkor] search failed — mode:%s %.0fms: %s", req.mode, duration_ms, e)
        raise
    duration_ms = (time.monotonic() - t0) * 1000
    result = [_serialize_fact(e) for e in edges]
    serialized_nodes = [_serialize_node(n) for n in nodes]
    logger.info("[gralkor] search result — mode:%s %d facts %d nodes %.0fms",
                req.mode, len(result), len(serialized_nodes), duration_ms)
    logger.debug("[gralkor] search facts: %s", result)
    return {"facts": result, "nodes": serialized_nodes}



@app.post("/build-indices")
async def build_indices():
    await graphiti.build_indices_and_constraints()
    return {"status": "ok"}


@app.post("/build-communities")
async def build_communities(req: GroupIdRequest):
    gid = _sanitize_group_id(req.group_id)
    async with _driver_lock:
        _ensure_driver_graph([gid])
        communities, edges = await graphiti.build_communities(
            group_ids=[gid],
        )
    return {"communities": len(communities), "edges": len(edges)}
