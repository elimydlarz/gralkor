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
from fastapi import APIRouter, FastAPI, HTTPException, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, create_model

from pipelines.capture_buffer import CaptureBuffer, CaptureClientError
from pipelines.distill import format_transcript
from pipelines.formatting import format_fact, format_node
from pipelines.interpret import interpret_facts
from pipelines.messages import Message



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


DEFAULT_LLM_PROVIDER = "gemini"
DEFAULT_LLM_MODEL = "gemini-3.1-flash-lite-preview"
DEFAULT_EMBEDDER_PROVIDER = "gemini"
DEFAULT_EMBEDDER_MODEL = "gemini-embedding-2-preview"


def _build_genai_client():
    import httpx
    from google import genai
    from google.genai.types import HttpOptions

    timeout = httpx.Timeout(connect=3.0, read=None, write=None, pool=3.0)
    http_options = HttpOptions(
        client_args={"transport": httpx.HTTPTransport(retries=1), "timeout": timeout},
        async_client_args={"transport": httpx.AsyncHTTPTransport(retries=1), "timeout": timeout},
    )
    return genai.Client(http_options=http_options)


def _build_llm_client(cfg: dict, genai_client=None):
    provider = cfg.get("llm", {}).get("provider") or DEFAULT_LLM_PROVIDER
    model = cfg.get("llm", {}).get("model") or (
        DEFAULT_LLM_MODEL if provider == DEFAULT_LLM_PROVIDER else None
    )
    llm_cfg = LLMConfig(model=model) if model else None

    if provider == "anthropic":
        from graphiti_core.llm_client.anthropic_client import AnthropicClient

        return AnthropicClient(config=llm_cfg)
    if provider == "gemini":
        from graphiti_core.llm_client.gemini_client import GeminiClient

        return GeminiClient(config=llm_cfg, client=genai_client)
    if provider == "groq":
        from graphiti_core.llm_client.groq_client import GroqClient

        return GroqClient(config=llm_cfg)

    # Default: openai (also covers azure_openai with base_url set via env)
    from graphiti_core.llm_client import OpenAIClient

    return OpenAIClient(config=llm_cfg)


def _build_embedder(cfg: dict, genai_client=None):
    provider = cfg.get("embedder", {}).get("provider") or DEFAULT_EMBEDDER_PROVIDER
    model = cfg.get("embedder", {}).get("model") or (
        DEFAULT_EMBEDDER_MODEL if provider == DEFAULT_EMBEDDER_PROVIDER else None
    )

    if provider == "gemini":
        from graphiti_core.embedder.gemini import GeminiEmbedder, GeminiEmbedderConfig

        ecfg = GeminiEmbedderConfig(embedding_model=model) if model else GeminiEmbedderConfig()
        return GeminiEmbedder(ecfg, client=genai_client)

    from graphiti_core.embedder import OpenAIEmbedder, OpenAIEmbedderConfig

    ecfg = OpenAIEmbedderConfig(embedding_model=model) if model else OpenAIEmbedderConfig()
    return OpenAIEmbedder(ecfg)


def _build_cross_encoder(cfg: dict, genai_client=None):
    """Match cross-encoder to LLM provider; fall back to OpenAI only if key is present."""
    provider = cfg.get("llm", {}).get("provider", "gemini")

    if provider == "gemini":
        from graphiti_core.cross_encoder.gemini_reranker_client import GeminiRerankerClient
        return GeminiRerankerClient(client=genai_client)

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

    genai_client = _build_genai_client()
    graphiti = Graphiti(
        graph_driver=driver,
        llm_client=_build_llm_client(cfg, genai_client=genai_client),
        embedder=_build_embedder(cfg, genai_client=genai_client),
        cross_encoder=_build_cross_encoder(cfg, genai_client=genai_client),
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

    global capture_buffer
    idle_seconds = float(cfg.get("capture", {}).get("idle_seconds", CAPTURE_IDLE_SECONDS_DEFAULT))
    capture_buffer = CaptureBuffer(idle_seconds=idle_seconds, flush_callback=_capture_flush)

    yield

    await capture_buffer.flush_all()
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


# ── Auth ─────────────────────────────────────────────────────


# ── Capture buffer ───────────────────────────────────────────

CAPTURE_IDLE_SECONDS_DEFAULT = 300.0
capture_buffer: CaptureBuffer | None = None


async def _capture_flush(group_id: str, turns: list[list[Message]]) -> None:
    if graphiti is None:
        return
    t0 = time.monotonic()
    episode_body = await format_transcript(turns, graphiti.llm_client)
    if not episode_body.strip():
        return
    logger.debug("[gralkor] [test] capture flush body: %s", episode_body)
    async with _driver_lock:
        result = await graphiti.add_episode(
            name=f"conversation-{int(time.time() * 1000)}",
            episode_body=episode_body,
            source_description="auto-capture",
            group_id=_sanitize_group_id(group_id),
            reference_time=datetime.now(timezone.utc),
            source=EpisodeType.message,
            entity_types=ontology_entity_types,
            edge_types=ontology_edge_types,
            edge_type_map=ontology_edge_type_map,
        )
    duration_ms = (time.monotonic() - t0) * 1000
    logger.info("[gralkor] capture flushed — group:%s uuid:%s bodyChars:%d %.0fms",
                group_id, result.episode.uuid, len(episode_body), duration_ms)


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


class RecallRequest(BaseModel):
    session_id: str = Field(min_length=1)
    group_id: str
    query: str
    max_results: int = 10


class RecallResponse(BaseModel):
    memory_block: str


class DistillRequest(BaseModel):
    turns: list[list[Message]]


class DistillResponse(BaseModel):
    episode_body: str


class CaptureRequest(BaseModel):
    session_id: str = Field(min_length=1)
    group_id: str
    messages: list[Message]


class SessionEndRequest(BaseModel):
    session_id: str = Field(min_length=1)


class MemorySearchRequest(BaseModel):
    session_id: str = Field(min_length=1)
    group_id: str
    query: str
    max_results: int = 20
    max_entity_results: int = 10


class MemorySearchResponse(BaseModel):
    text: str


class MemoryAddRequest(BaseModel):
    group_id: str
    content: str
    source_description: str = "manual"


class MemoryAddResponse(BaseModel):
    status: Literal["stored"]


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


router = APIRouter()


def _conversation_for_session(session_id: str) -> list[Message]:
    if capture_buffer is None:
        return []
    flat: list[Message] = []
    for turn in capture_buffer.turns_for(session_id):
        flat.extend(turn)
    return flat


FURTHER_QUERYING_INSTRUCTION = (
    "Search memory (up to 3 times, diverse queries) if you need more detail."
)


@router.get("/health")
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


@router.post("/episodes")
async def add_episode(req: AddEpisodeRequest):
    cached = _idempotency_check(req.idempotency_key)
    if cached is not None:
        return cached

    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    episode_type = EpisodeType(req.source) if req.source else EpisodeType.message
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
    episode = result.episode
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
        except Exception as e:
            # Invalid group_id (e.g. hyphens rejected by FalkorDB).  Skip routing
            # so the search runs against the current graph and returns empty results
            # instead of 500ing.
            logger.warning("[gralkor] driver graph routing failed for %s: %s", target, e)


@router.post("/search")
async def search(req: SearchRequest):
    # Sanitize group IDs: hyphens cause RediSearch syntax errors in graphiti-core.
    sanitized = [_sanitize_group_id(g) for g in req.group_ids]
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
    result = [_serialize_fact(e) for e in edges]
    serialized_nodes = [_serialize_node(n) for n in nodes]
    return {"facts": result, "nodes": serialized_nodes}



@router.post("/build-indices")
async def build_indices():
    await graphiti.build_indices_and_constraints()
    return {"status": "ok"}


@router.post("/build-communities")
async def build_communities(req: GroupIdRequest):
    gid = _sanitize_group_id(req.group_id)
    async with _driver_lock:
        _ensure_driver_graph([gid])
        communities, edges = await graphiti.build_communities(
            group_ids=[gid],
        )
    return {"communities": len(communities), "edges": len(edges)}


# ── New endpoints ────────────────────────────────────────────


@router.post("/recall", response_model=RecallResponse)
async def recall(req: RecallRequest) -> RecallResponse:
    sanitized = _sanitize_group_id(req.group_id)
    conversation = _conversation_for_session(req.session_id)
    logger.info("[gralkor] recall — session:%s group:%s queryChars:%d max:%d",
                req.session_id, sanitized, len(req.query), req.max_results)
    logger.debug("[gralkor] [test] recall query: %s", req.query)
    t0 = time.monotonic()

    async with _driver_lock:
        _ensure_driver_graph([sanitized])
        edges = await graphiti.search(
            query=_sanitize_query(req.query),
            group_ids=[sanitized],
            num_results=req.max_results,
        )

    facts = [_serialize_fact(e) for e in edges]
    if not facts:
        logger.info("[gralkor] recall result — 0 facts %.0fms",
                    (time.monotonic() - t0) * 1000)
        return RecallResponse(memory_block="")

    facts_text = "\n".join(format_fact(f) for f in facts)
    interpretation = await interpret_facts(conversation, facts_text, graphiti.llm_client)

    block = (
        '<gralkor-memory trust="untrusted">\n'
        f"Facts:\n{facts_text}\n\n"
        f"Interpretation:\n{interpretation}\n\n"
        f"{FURTHER_QUERYING_INSTRUCTION}\n"
        "</gralkor-memory>"
    )
    duration_ms = (time.monotonic() - t0) * 1000
    logger.info("[gralkor] recall result — %d facts blockChars:%d %.0fms",
                len(facts), len(block), duration_ms)
    logger.debug("[gralkor] [test] recall block: %s", block)
    return RecallResponse(memory_block=block)


@router.post("/distill", response_model=DistillResponse)
async def distill(req: DistillRequest) -> DistillResponse:
    episode_body = await format_transcript(req.turns, graphiti.llm_client if graphiti else None)
    return DistillResponse(episode_body=episode_body)


@router.post("/capture", status_code=status.HTTP_204_NO_CONTENT)
async def capture(req: CaptureRequest) -> Response:
    if capture_buffer is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "capture buffer not initialized")
    sanitized = _sanitize_group_id(req.group_id)
    capture_buffer.append(req.session_id, sanitized, req.messages)
    logger.debug("[gralkor] [test] capture messages: %s",
                 [(m.role, m.content) for m in req.messages])
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/session_end", status_code=status.HTTP_204_NO_CONTENT)
async def session_end(req: SessionEndRequest) -> Response:
    if capture_buffer is None:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "capture buffer not initialized")
    turns = len(capture_buffer.turns_for(req.session_id))
    capture_buffer.flush(req.session_id)
    logger.info("[gralkor] session_end session:%s turns:%d", req.session_id, turns)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/tools/memory_search", response_model=MemorySearchResponse)
async def tools_memory_search(req: MemorySearchRequest) -> MemorySearchResponse:
    sanitized = _sanitize_group_id(req.group_id)
    conversation = _conversation_for_session(req.session_id)
    logger.info("[gralkor] tools.memory_search — session:%s group:%s queryChars:%d max:%d/%d",
                req.session_id, sanitized, len(req.query), req.max_results, req.max_entity_results)
    logger.debug("[gralkor] [test] tools.memory_search query: %s", req.query)
    t0 = time.monotonic()

    async with _driver_lock:
        _ensure_driver_graph([sanitized])
        config = deepcopy(COMBINED_HYBRID_SEARCH_CROSS_ENCODER)
        config.limit = req.max_results
        search_result = await graphiti.search_(
            query=_sanitize_query(req.query),
            group_ids=[sanitized],
            config=config,
        )

    facts = [_serialize_fact(e) for e in search_result.edges]
    nodes = [_serialize_node(n) for n in search_result.nodes[: req.max_entity_results]]

    if not facts and not nodes:
        logger.info("[gralkor] tools.memory_search result — 0 facts 0 entities %.0fms",
                    (time.monotonic() - t0) * 1000)
        return MemorySearchResponse(text="Facts: (none)\nEntities: (none)")

    facts_section = "Facts:\n" + ("\n".join(format_fact(f) for f in facts) if facts else "(none)")
    entities_section = "Entities:\n" + (
        "\n".join(format_node(n) for n in nodes) if nodes else "(none)"
    )
    facts_text = facts_section + "\n\n" + entities_section
    interpretation = await interpret_facts(conversation, facts_text, graphiti.llm_client)
    text = f"{facts_text}\n\nInterpretation:\n{interpretation}"
    duration_ms = (time.monotonic() - t0) * 1000
    logger.info("[gralkor] tools.memory_search result — %d facts %d entities textChars:%d %.0fms",
                len(facts), len(nodes), len(text), duration_ms)
    logger.debug("[gralkor] [test] tools.memory_search text: %s", text)
    return MemorySearchResponse(text=text)


@router.post("/tools/memory_add", response_model=MemoryAddResponse)
async def tools_memory_add(req: MemoryAddRequest) -> MemoryAddResponse:
    sanitized = _sanitize_group_id(req.group_id)
    async with _driver_lock:
        await graphiti.add_episode(
            name=f"manual-add-{int(time.time() * 1000)}",
            episode_body=req.content,
            source_description=req.source_description,
            group_id=sanitized,
            reference_time=datetime.now(timezone.utc),
            source=EpisodeType.text,
            entity_types=ontology_entity_types,
            edge_types=ontology_edge_types,
            edge_type_map=ontology_edge_type_map,
        )
    return MemoryAddResponse(status="stored")


app.include_router(router)
