"""Thin FastAPI server wrapping graphiti-core for the Gralkor plugin."""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
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


# ── Request / response models ────────────────────────────────


class EpisodeBlock(BaseModel):
    type: str  # "text" or "thinking"
    text: str


class EpisodeMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: list[EpisodeBlock]


class AddEpisodeRequest(BaseModel):
    name: str
    source_description: str
    group_id: str
    reference_time: str | None = None
    source: str | None = None
    # Structured messages from auto-capture (server formats transcript + distills thinking)
    messages: list[EpisodeMessage] | None = None
    # Legacy: pre-formatted episode body (used by memory_add tool)
    episode_body: str | None = None


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
    "You are a concise summarizer. Given an AI agent's internal thinking from a "
    "conversation turn, produce a single sentence describing what the agent did and why. "
    "Focus on decisions, actions taken, and outcomes. "
    "Omit operational details like tool names, file reading, or searching. "
    "Write in past tense. Output only the summary sentence, nothing else."
)


async def _distill_one(llm_client: Any, thinking: str) -> str:
    """Distill a single turn's thinking into an action summary."""
    from graphiti_core.prompts.models import Message

    messages = [
        Message(role="system", content=_DISTILL_SYSTEM_PROMPT),
        Message(role="user", content=thinking),
    ]
    result = await llm_client.generate_response(messages, max_tokens=150)
    return result.get("content", "").strip()


async def _distill_thinking(llm_client: Any, thinking_blocks: list[str]) -> list[str]:
    """Distill thinking blocks into action summaries, one per turn.

    Returns a list parallel to thinking_blocks. Failed entries are empty strings.
    """

    async def _safe_distill(thinking: str) -> str:
        if not thinking.strip():
            return ""
        try:
            return await _distill_one(llm_client, thinking)
        except Exception as e:
            logger.warning("Thinking distillation failed: %s", e)
            return ""

    return list(await asyncio.gather(*[_safe_distill(t) for t in thinking_blocks]))


async def _format_transcript(
    msgs: list[EpisodeMessage],
    llm_client: Any | None,
) -> str:
    """Format structured messages into a transcript, distilling thinking into action summaries.

    Groups thinking blocks per turn (all thinking between two user messages),
    distills each group into a single (action: ...) line via LLM, and formats
    the transcript as:
        User: ...
        Assistant: (action: ...)
        Assistant: ...
    """
    # Group thinking per turn and build transcript parts (without thinking)
    turns_thinking: list[list[str]] = []  # one list of thinking texts per turn
    current_thinking: list[str] = []
    parts: list[tuple[str, str]] = []  # (role_prefix, text) pairs

    for msg in msgs:
        if msg.role == "user":
            # Flush thinking from previous turn
            if current_thinking:
                turns_thinking.append(current_thinking)
                current_thinking = []
            for block in msg.content:
                if block.type == "text":
                    parts.append(("user", block.text))
        elif msg.role == "assistant":
            for block in msg.content:
                if block.type == "thinking":
                    current_thinking.append(block.text)
                elif block.type == "text":
                    parts.append(("assistant", block.text))

    # Flush remaining thinking
    if current_thinking:
        turns_thinking.append(current_thinking)

    # Distill thinking into action summaries
    summaries: list[str] = []
    if turns_thinking and llm_client:
        joined = ["\n---\n".join(blocks) for blocks in turns_thinking]
        summaries = await _distill_thinking(llm_client, joined)

    # Build transcript with action summaries injected
    lines: list[str] = []
    turn_index = -1
    injected: set[int] = set()

    for role, text in parts:
        if role == "user":
            turn_index += 1
            lines.append(f"User: {text}")
        elif role == "assistant":
            # Inject action summary before first assistant line of this turn
            if turn_index >= 0 and turn_index not in injected and turn_index < len(summaries) and summaries[turn_index]:
                lines.append(f"Assistant: (action: {summaries[turn_index]})")
                injected.add(turn_index)
            lines.append(f"Assistant: {text}")

    return "\n".join(lines)


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
    episode_type = EpisodeType(req.source) if req.source else EpisodeType.message

    episode_body = req.episode_body
    if req.thinking_blocks and graphiti and graphiti.llm_client:
        summaries = await _distill_thinking(graphiti.llm_client, req.thinking_blocks)
        episode_body = _inject_action_summaries(episode_body, summaries)

    result = await graphiti.add_episode(
        name=req.name,
        episode_body=episode_body,
        source_description=req.source_description,
        group_id=req.group_id,
        reference_time=ref_time,
        source=episode_type,
        entity_types=ontology_entity_types,
        edge_types=ontology_edge_types,
        edge_type_map=ontology_edge_type_map,
        excluded_entity_types=ontology_excluded,
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
    }


@app.delete("/edges/{uuid}")
async def delete_edge(uuid: str):
    driver = graphiti.driver
    edge = await EntityEdge.get_by_uuid(driver, uuid)
    await edge.delete(driver)
    return Response(status_code=204)


@app.post("/clear")
async def clear_graph(req: GroupIdRequest):
    driver = graphiti.driver
    await Node.delete_by_group_id(driver, req.group_id)
    return {"deleted": True}


@app.post("/build-indices")
async def build_indices():
    await graphiti.build_indices_and_constraints()
    return {"status": "ok"}


@app.post("/build-communities")
async def build_communities(req: GroupIdRequest):
    communities, edges = await graphiti.build_communities(
        group_ids=[req.group_id],
    )
    return {"communities": len(communities), "edges": len(edges)}
