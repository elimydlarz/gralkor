# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

## What is this?

An OpenClaw memory plugin that gives AI agents persistent, temporally-aware memory.
Uses Graphiti (knowledge graph framework by Zep) backed by FalkorDB (in-memory graph database).
Drop-in replacement for `memory-lancedb` in the OpenClaw memory slot.

## Architecture

```
OpenClaw Gateway (Node.js)
  └── memory-gralkor plugin (TypeScript)
        ├── Tools: memory_recall, memory_store, memory_forget
        ├── Hooks: before_agent_start (auto-recall), agent_end (auto-capture)
        ├── Service: health monitor (60s interval)
        └── CLI: gralkor status, gralkor search, gralkor clear
              │
              ▼  HTTP (fetch)
        Graphiti REST API (FastAPI, port 8000)
              │
              ▼  Redis protocol
        FalkorDB (port 6379, browser UI port 3000)
```

## File Structure

- `src/index.ts` — Plugin entry point. Default export with `register(api, config)`. Wires up tools, hooks, service, and CLI. Falls back to CLI-only mode if no `graphitiUrl` is explicitly configured.
- `src/client.ts` — `GraphitiClient` class. HTTP wrapper around the Graphiti REST API with retry logic (retries network errors and 5xx, not 4xx) and configurable timeout.
- `src/tools.ts` — Tool factories: `memory_recall`, `memory_store`, `memory_forget`. Each takes `(client, config)` and returns a tool object.
- `src/hooks.ts` — Hook factories: `before_agent_start` (auto-recall), `agent_end` (auto-capture). Both degrade silently if Graphiti is unreachable.
- `src/config.ts` — `GralkorConfig` interface, defaults, `resolveConfig()`, and `resolveGroupId()`.
- `openclaw.plugin.json` — Plugin manifest with config schema and UI hints.
- `docker-compose.yml` — FalkorDB + Graphiti backend services.
- `server/main.py` — Graphiti REST API server (FastAPI). Thin wrapper around `graphiti-core`.
- `server/requirements.txt` — Python runtime dependencies.
- `server/requirements-dev.txt` — Python test dependencies (pytest, pytest-asyncio, httpx).
- `server/tests/` — Functional tests for the REST API. Mock `graphiti-core` at the boundary; exercise real HTTP through FastAPI's ASGI stack.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `graphitiUrl` | string | `http://localhost:8000` | Graphiti REST API URL |
| `groupIdStrategy` | enum | `per-user` | How to partition the knowledge graph |
| `autoCapture.enabled` | boolean | `true` | Store conversations automatically |
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `5` | Max facts injected as context |

### Group ID Strategy

Controls how the knowledge graph is partitioned:
- `per-user` — each user gets their own graph, keyed by `ctx.senderId` (default)
- `per-conversation` — per session, keyed by `ctx.sessionKey` or `channel-senderId`
- `global` — single shared graph under the key `"gralkor"`

### Graceful Degradation

- If `graphitiUrl` is **not explicitly configured** (no config value, no `GRAPHITI_URL` env var), only the CLI is registered — no tools or hooks. This lets users run `gralkor status` to diagnose setup.
- If Graphiti is configured but **unreachable at runtime**, hooks silently skip (no errors surfaced to the agent), and tools throw so the agent sees the failure.

## Environment Variables

- `OPENAI_API_KEY` — API key for OpenAI. Default LLM + embeddings provider.
- `ANTHROPIC_API_KEY` — API key for Anthropic (still needs `OPENAI_API_KEY` for embeddings).
- `GOOGLE_API_KEY` — API key for Gemini (fully self-contained: LLM + embeddings + reranking).
- `GROQ_API_KEY` — API key for Groq (still needs `OPENAI_API_KEY` for embeddings).
- `GRAPHITI_URL` — Optional. Checked by the plugin as a fallback if `graphitiUrl` isn't in the plugin config.

LLM provider is configured in `config.yaml` (`llm.provider` and `embedder.provider`). See `.env.example` for details.

## Dev Workflow

```bash
# Start backend services
docker compose up -d

# Verify Graphiti is running (port 8001 on host, 8000 inside container)
curl http://localhost:8001/health

# Install plugin locally in OpenClaw (for development)
openclaw plugins install -l .

# Set memory slot in openclaw.json:
#   plugins.slots.memory = "memory-gralkor"

# Type-check
make typecheck

# Run all tests (plugin + server)
make test

# Run only plugin tests (TypeScript)
make test-plugin

# Run only server tests (Python) — no Docker/FalkorDB needed
make test-server

# First time only: install server test deps
cd server && pip install -r requirements.txt -r requirements-dev.txt
```

## Building & Deploying

```bash
# Build a tarball for deployment
npm pack
# produces: openclaw-memory-gralkor-0.1.0.tgz

# Install from tarball on the remote host
openclaw plugins install ~/openclaw-memory-gralkor-0.1.0.tgz
```

The `files` field in `package.json` controls what goes into the tarball: `src/`, `openclaw.plugin.json`, `docker-compose.yml`, `config.yaml`, `.env.example`.

## Key Commands

- `make test` — run all tests (plugin + server)
- `make test-plugin` — plugin tests only (vitest)
- `make test-server` — server tests only (pytest, no Docker needed)
- `make typecheck` — type-check TypeScript
- `make up` / `make down` / `make logs` — Docker services
- Graphiti host port: **8001** (avoids Coolify's 8000). Container-internal port is still 8000.
- `npm pack` — build deployment tarball

## Server Tests

Functional tests for the Graphiti REST API live in `server/tests/`. They need **no Docker, no FalkorDB, no LLM API keys**.

```bash
cd server
pip install -r requirements.txt -r requirements-dev.txt
pytest tests/ -v
```

### What's mocked vs. real

| Mocked (graphiti-core boundary) | Exercised for real |
|---|---|
| `Graphiti` instance methods (`add_episode`, `search`, etc.) | FastAPI routing, ASGI stack |
| `Graphiti.driver` (FalkorDB access) | Pydantic request validation |
| `EntityEdge.get_by_uuid()` / `edge.delete()` | Serializer functions (`_serialize_fact`, `_serialize_node`, `_serialize_episode`) |
| `Node.delete_by_group_id()` | HTTP status codes, response bodies |

### How it works

`httpx.AsyncClient` with `ASGITransport(app=app)` sends real HTTP through FastAPI in-process. `ASGITransport` does **not** trigger lifespan events, so the real `Graphiti(...)` constructor and FalkorDB connection are never called. The `conftest.py` `client` fixture injects an `AsyncMock` into the `main.graphiti` module global instead.

Factory helpers (`make_episode`, `make_edge`, `make_entity`) return `SimpleNamespace` objects that duck-type the real `graphiti-core` domain objects — the serializers only read plain attributes, so this works without importing the real classes (which would try to connect to FalkorDB).

### Test files

- `test_health.py` — `GET /health`
- `test_episodes.py` — `POST /episodes`, `GET /episodes`, `DELETE /episodes/{uuid}`
- `test_search.py` — `POST /search`, `POST /search/nodes`
- `test_graph_ops.py` — `DELETE /edges/{uuid}`, `POST /clear`, `POST /build-indices`, `POST /build-communities`

## Conventions

- TypeScript, ES modules (`"type": "module"`)
- Target: ES2022, module resolution: bundler
- All Graphiti communication is HTTP via `src/client.ts` — no direct FalkorDB access
- Tool names follow the `memory_*` pattern (matches `memory-lancedb` for slot compatibility)
- Config types are plain TypeScript interfaces in `src/config.ts`
- Imports use `.js` extensions (required for ESM with TypeScript)

## Gotchas

- Graphiti requires an LLM provider API key — without one the container starts but all operations fail
- FalkorDB must be healthy before Graphiti can start (`depends_on` in docker-compose handles this, but no healthcheck — Graphiti may need a few seconds after FalkorDB is up)
- The client retries network errors and 5xx responses (up to 2 retries with backoff) but throws immediately on 4xx client errors
- Auto-recall injects context as XML-tagged content marked `trust="untrusted"`
- Auto-capture skips messages shorter than 10 chars and messages starting with `/`

## Deployment

When deployed alongside OpenClaw on a VPS, set `FALKORDB_DATA_DIR` to colocate FalkorDB data inside OpenClaw's `/data` volume. This way existing backup/restore scripts capture graph data automatically. The `gralkor` Docker network lets the OpenClaw container reach Graphiti at `http://graphiti:8000` (container-internal port).
