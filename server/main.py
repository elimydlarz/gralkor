"""Thin FastAPI server wrapping graphiti-core for the Gralkor plugin."""

from __future__ import annotations

import asyncio
import logging
import os
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

import yaml
from fastapi import FastAPI, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, create_model



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
    """Build ontology from config. Returns (entity_types, edge_types, edge_type_map, excluded)."""
    raw = cfg.get("ontology")
    if not raw:
        return None, None, None, None

    entity_defs = raw.get("entities") or {}
    edge_defs = raw.get("edges") or {}
    edge_map_raw = raw.get("edgeMap") or {}
    excluded_raw = raw.get("excludedEntityTypes")

    entity_types = _build_type_defs(entity_defs) if entity_defs else None
    edge_types = _build_type_defs(edge_defs) if edge_defs else None

    edge_type_map: dict[tuple[str, str], list[str]] | None = None
    if edge_map_raw:
        edge_type_map = {}
        for key, values in edge_map_raw.items():
            parts = key.split(",")
            edge_type_map[(parts[0], parts[1])] = values

    excluded = list(excluded_raw) if excluded_raw else None

    if not entity_types and not edge_types and not edge_type_map and not excluded:
        return None, None, None, None

    return entity_types, edge_types, edge_type_map, excluded


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
ontology_excluded: list[str] | None = None


@asynccontextmanager
async def lifespan(_app: FastAPI):
    global graphiti, ontology_entity_types, ontology_edge_types, ontology_edge_type_map, ontology_excluded
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

    ontology_entity_types, ontology_edge_types, ontology_edge_type_map, ontology_excluded = _build_ontology(cfg)
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


# ── Idempotency store ────────────────────────────────────────

# In-memory store: idempotency_key -> (serialized_episode, monotonic_expiry)
_idempotency_store: dict[str, tuple[dict[str, Any], float]] = {}
_IDEMPOTENCY_TTL = 300  # 5 minutes


def _idempotency_check(key: str) -> dict[str, Any] | None:
    """Return cached episode if key exists and is not expired, else None."""
    entry = _idempotency_store.get(key)
    if entry is None:
        return None
    if entry[1] > time.monotonic():
        return entry[0]
    del _idempotency_store[key]
    return None


def _idempotency_store_result(key: str, result: dict[str, Any]) -> None:
    """Cache the result under the idempotency key with TTL."""
    _idempotency_store[key] = (result, time.monotonic() + _IDEMPOTENCY_TTL)
    # Lazy cleanup when store grows large
    if len(_idempotency_store) > 100:
        now = time.monotonic()
        expired = [k for k, (_, exp) in _idempotency_store.items() if exp <= now]
        for k in expired:
            del _idempotency_store[k]


# ── Request / response models ────────────────────────────────


class AddEpisodeRequest(BaseModel):
    name: str
    episode_body: str
    source_description: str
    group_id: str
    reference_time: str | None = None
    source: str | None = None
    idempotency_key: str


class ContentBlock(BaseModel):
    """A content block within a conversation message.

    Supported types:
    - "text": Natural language content (user input or assistant response).
    - "thinking": Internal reasoning trace from the assistant.
    - "tool_use": Serialized tool call (tool name + input).
    - "tool_result": Truncated tool output.
    The server groups thinking, tool_use, and tool_result blocks for
    behaviour distillation before ingestion.
    """
    type: str
    text: str


class ConversationMessage(BaseModel):
    """A single message in a conversation transcript.

    role: "user" for human input, "assistant" for agent output.
    content: Ordered list of content blocks. A message may contain
             multiple blocks (e.g. thinking followed by text).
    """
    role: str
    content: list[ContentBlock]


class IngestMessagesRequest(BaseModel):
    """Ingest a structured conversation for knowledge graph extraction.

    The server formats the transcript, distills thinking blocks into
    behaviour summaries, and creates an episode in the knowledge graph.
    """
    name: str
    source_description: str
    group_id: str
    messages: list[ConversationMessage]
    reference_time: str | None = None
    idempotency_key: str


class SearchRequest(BaseModel):
    query: str
    group_ids: list[str]
    num_results: int = 10


class GroupIdRequest(BaseModel):
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
        "expired_at": _ts(edge.expired_at),
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


# ── Transcript formatting & thinking distillation ─────────────

logger = logging.getLogger(__name__)

_DISTILL_SYSTEM_PROMPT = (
    "You are a distillery for agentic thought and action. Given an AI agent's internal "
    "thinking and tool usage from a conversation turn, capture the reasoning and actions "
    "the agent took and contextualise them within the dialog. Write one to three sentences "
    "— no filler, maximum distillation. Focus on reasoning, decisions, actions taken "
    "(including which tools were used and why), and outcomes. "
    "IMPORTANT: When the agent retrieves information from memory (memory_search results, "
    "knowledge graph facts, etc.), do NOT repeat or summarize the retrieved content. "
    "Instead, note that memory was consulted and focus on what the agent concluded, "
    "decided, or did as a result. The retrieved facts are already stored — re-stating "
    "them creates redundancy. Capture the thinking, not the remembering. "
    "Write in first person, past tense. Output only the distilled text, nothing else."
)


async def _distill_one(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's behaviour (thinking + tool use) into a summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=300)
    return result.get("content", "").strip()


async def _distill_thinking(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill behaviour blocks (thinking + tool use) into summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Behaviour distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def _format_transcript(
    msgs: list[ConversationMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling behaviour into summaries.

    Each turn is a user message followed by assistant responses until the next
    user message. Behaviour blocks (thinking, tool_use, tool_result) are distilled
    into a single (behaviour: ...) line injected before the turn's assistant text.
    """

    @dataclass
    class Turn:
        user_lines: list[str] = field(default_factory=list)
        behaviour: list[str] = field(default_factory=list)
        assistant_lines: list[str] = field(default_factory=list)

    # Parse messages into turns
    turns: list[Turn] = [Turn()]
    for msg in msgs:
        if msg.role == "user":
            turns.append(Turn())
            for block in msg.content:
                if block.type == "text":
                    turns[-1].user_lines.append(block.text)
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type in ("thinking", "tool_use", "tool_result"):
                    turns[-1].behaviour.append(block.text)
                elif block.type == "text":
                    turns[-1].assistant_lines.append(block.text)

    # Distill behaviour blocks (only for turns that have them)
    to_distill = [(i, "\n---\n".join(t.behaviour)) for i, t in enumerate(turns) if t.behaviour]
    summaries: dict[int, str] = {}
    if to_distill and llm_client:
        texts = [text for _, text in to_distill]
        sizes = [len(text) for text in texts]
        logger.info("[gralkor] behaviour distillation — groups:%d sizes:%s totalChars:%d", len(texts), sizes, sum(sizes))
        logger.debug("[gralkor] behaviour pre-distill:\n%s", "\n===\n".join(texts))
        results = await _distill_thinking(llm_client, texts)
        for (i, _), result in zip(to_distill, results):
            if result:
                summaries[i] = result
        logger.info("[gralkor] behaviour distilled — %d/%d succeeded", len(summaries), len(texts))
        logger.debug("[gralkor] behaviour post-distill: %s", summaries)

    # Format transcript
    lines: list[str] = []
    for i, turn in enumerate(turns):
        for text in turn.user_lines:
            lines.append(f"User: {text}")
        if i in summaries:
            lines.append(f"Assistant: (behaviour: {summaries[i]})")
        for text in turn.assistant_lines:
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


# ── Endpoints ─────────────────────────────────────────────────


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
    logger.debug("[gralkor] add-episode body:\n%s", req.episode_body)
    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    episode_type = EpisodeType(req.source) if req.source else EpisodeType.message
    t0 = time.monotonic()
    result = await graphiti.add_episode(
        name=req.name,
        episode_body=req.episode_body,
        source_description=req.source_description,
        group_id=req.group_id,
        reference_time=ref_time,
        source=episode_type,
        entity_types=ontology_entity_types,
        edge_types=ontology_edge_types,
        edge_type_map=ontology_edge_type_map,
        excluded_entity_types=ontology_excluded,
    )
    duration_ms = (time.monotonic() - t0) * 1000
    episode = result.episode
    logger.info("[gralkor] episode added — uuid:%s duration:%.0fms", episode.uuid, duration_ms)
    logger.debug("[gralkor] episode result: %s", _serialize_episode(episode))
    serialized = _serialize_episode(episode)
    _idempotency_store_result(req.idempotency_key, serialized)
    return serialized


@app.post("/ingest-messages")
async def ingest_messages(req: IngestMessagesRequest):
    cached = _idempotency_check(req.idempotency_key)
    if cached is not None:
        logger.info("[gralkor] ingest-messages idempotent hit — key:%s uuid:%s",
                    req.idempotency_key, cached.get("uuid"))
        return cached

    logger.info("[gralkor] ingest-messages — group:%s messages:%d", req.group_id, len(req.messages))
    ref_time = (
        datetime.fromisoformat(req.reference_time)
        if req.reference_time
        else datetime.now(timezone.utc)
    )
    llm = graphiti.llm_client if graphiti else None
    episode_body = await _format_transcript(req.messages, llm)

    logger.info("[gralkor] episode body — chars:%d lines:%d", len(episode_body), episode_body.count('\n') + 1)
    logger.debug("[gralkor] episode body:\n%s", episode_body)

    t0 = time.monotonic()
    result = await graphiti.add_episode(
        name=req.name,
        episode_body=episode_body,
        source_description=req.source_description,
        group_id=req.group_id,
        reference_time=ref_time,
        source=EpisodeType.message,
        entity_types=ontology_entity_types,
        edge_types=ontology_edge_types,
        edge_type_map=ontology_edge_type_map,
        excluded_entity_types=ontology_excluded,
    )
    duration_ms = (time.monotonic() - t0) * 1000
    episode = result.episode
    logger.info("[gralkor] episode added — uuid:%s duration:%.0fms", episode.uuid, duration_ms)
    logger.debug("[gralkor] episode result: %s", _serialize_episode(episode))
    serialized = _serialize_episode(episode)
    _idempotency_store_result(req.idempotency_key, serialized)
    return serialized


@app.get("/episodes")
async def get_episodes(group_id: str, limit: int = 10):
    _ensure_driver_graph([group_id])
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
        graphiti.driver = graphiti.driver.clone(database=target)
        graphiti.clients.driver = graphiti.driver
        print(f"[gralkor] driver graph routed: {target}", flush=True)


def _prioritize_facts(
    edges: list[EntityEdge], limit: int, reserved_ratio: float = 0.7,
) -> list[EntityEdge]:
    """Reserve slots for valid facts, fill the rest by relevance.

    First ~70% of slots are reserved for valid facts (no invalid_at).
    Remaining slots are filled from whatever Graphiti ranked highest
    among the leftovers — valid or not — preserving relevance scoring.
    """
    reserved_count = max(1, round(limit * reserved_ratio))

    reserved: list[EntityEdge] = []
    rest: list[EntityEdge] = []
    for e in edges:
        if len(reserved) < reserved_count and e.invalid_at is None:
            reserved.append(e)
        else:
            rest.append(e)

    remainder_count = limit - len(reserved)
    return reserved + rest[:remainder_count]


@app.post("/search")
async def search(req: SearchRequest):
    logger.info("[gralkor] search — query:%d chars group_ids:%s num_results:%d",
                len(req.query), req.group_ids, req.num_results)
    # graphiti.add_episode() clones the driver to target the correct FalkorDB
    # named graph (database=group_id), but graphiti.search() does not — it just
    # uses whatever graph the driver currently points at. Before the first
    # add_episode, the driver targets 'default_db' (an empty graph), so all
    # searches return 0 results. Fix: route to the correct graph here.
    _ensure_driver_graph(req.group_ids)
    t0 = time.monotonic()
    # Over-fetch to compensate for expired facts that will be deprioritized.
    fetch_limit = req.num_results * 2
    try:
        edges = await graphiti.search(
            query=_sanitize_query(req.query),
            group_ids=req.group_ids,
            num_results=fetch_limit,
        )
    except Exception as e:
        duration_ms = (time.monotonic() - t0) * 1000
        logger.error("[gralkor] search failed — %.0fms: %s", duration_ms, e)
        raise
    duration_ms = (time.monotonic() - t0) * 1000
    prioritized = _prioritize_facts(edges, req.num_results)
    valid_count = sum(1 for e in prioritized if e.invalid_at is None)
    result = [_serialize_fact(e) for e in prioritized]
    logger.info("[gralkor] search result — %d facts (%d valid, %d non-valid) from %d fetched %.0fms",
                len(prioritized), valid_count, len(prioritized) - valid_count, len(edges), duration_ms)
    logger.debug("[gralkor] search facts: %s", result)
    return {"facts": result}


@app.delete("/edges/{uuid}")
async def delete_edge(uuid: str):
    driver = graphiti.driver
    edge = await EntityEdge.get_by_uuid(driver, uuid)
    await edge.delete(driver)
    return Response(status_code=204)


@app.post("/clear")
async def clear_graph(req: GroupIdRequest):
    _ensure_driver_graph([req.group_id])
    driver = graphiti.driver
    await Node.delete_by_group_id(driver, req.group_id)
    return {"deleted": True}


@app.post("/build-indices")
async def build_indices():
    await graphiti.build_indices_and_constraints()
    return {"status": "ok"}


@app.post("/build-communities")
async def build_communities(req: GroupIdRequest):
    _ensure_driver_graph([req.group_id])
    communities, edges = await graphiti.build_communities(
        group_ids=[req.group_id],
    )
    return {"communities": len(communities), "edges": len(edges)}
