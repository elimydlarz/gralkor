# Gralkor — OpenClaw Memory/Tool Plugin (Graphiti + FalkorDB)

## What is this?

An OpenClaw plugin that gives AI agents persistent, temporally-aware memory via knowledge graphs.
Uses Graphiti (knowledge graph framework by Zep) backed by FalkorDB (in-memory graph database).

Gralkor ships **two entry points** in the same package. Only one should be active at a time:

| | Memory mode | Tool mode |
|---|---|---|
| Entry point | `src/index.ts` → `dist/index.js` | `src/tool-entry.ts` → `dist/tool-entry.js` |
| Plugin ID | `memory-gralkor` | `tool-gralkor` |
| Kind | `"memory"` | `"tool"` |
| Tool names | `memory_recall`, `memory_store`, `memory_forget` | `graph_search`, `graph_add` |
| Slot | Takes the memory slot (replaces `memory-core`) | No slot — coexists with `memory-core` |
| Hooks | `before_agent_start`, `agent_end` | Same |
| CLI | `gralkor` | `gralkor` |

**Memory mode** (`memory-gralkor`): Replaces the native memory plugin. The agent uses Graphiti as its sole memory backend.

**Tool mode** (`tool-gralkor`): Runs alongside `memory-core`. The agent keeps native `memory_search`/`memory_get` over Markdown files AND gets Graphiti-powered `graph_search`/`graph_add` tools for structured knowledge retrieval.

Both modes register the same auto-capture (`agent_end`) and auto-recall (`before_agent_start`) hooks — conversations are automatically stored and relevant facts are automatically injected regardless of which mode is active.

## Architecture

```
OpenClaw Gateway (Node.js)
  └── gralkor plugin (TypeScript)
        ├── Entry: memory-gralkor (kind: memory) OR tool-gralkor (kind: tool)
        ├── Tools: memory_recall/store/forget (memory mode)
        │      OR: graph_search/graph_add (tool mode)
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

- `src/index.ts` — Memory-mode entry point (`memory-gralkor`, `kind: "memory"`). Registers `memory_recall`, `memory_store`, `memory_forget`. Falls back to CLI-only mode if no `graphitiUrl` is explicitly configured.
- `src/tool-entry.ts` — Tool-mode entry point (`tool-gralkor`, `kind: "tool"`). Registers `graph_search`, `graph_add`. Same fallback behavior.
- `src/register.ts` — Shared registration helpers (`registerCli`, `registerHooks`, `registerHealthService`) used by both entry points.
- `src/client.ts` — `GraphitiClient` class. HTTP wrapper around the Graphiti REST API with retry logic (retries network errors and 5xx, not 4xx) and configurable timeout.
- `src/tools.ts` — Tool factories: `createMemoryRecallTool`, `createMemoryStoreTool`, `createMemoryForgetTool`. Accept optional `ToolOverrides` to customize name/description (used by tool-entry for `graph_*` names).
- `src/hooks.ts` — Hook factories: `before_agent_start` (auto-recall), `agent_end` (auto-capture). Both degrade silently if Graphiti is unreachable.
- `src/config.ts` — `GralkorConfig` interface, defaults, `resolveConfig()`, and `resolveGroupId()`.
- `openclaw.plugin.json` — Memory-mode plugin manifest with config schema and UI hints.
- `openclaw.tool-plugin.json` — Tool-mode plugin manifest with config schema and UI hints.
- `docker-compose.yml` — FalkorDB + Graphiti backend services.
- `server/main.py` — Graphiti REST API server (FastAPI). Thin wrapper around `graphiti-core`.
- `server/requirements.txt` — Python runtime dependencies.
- `server/requirements-dev.txt` — Python test dependencies (pytest, pytest-asyncio, httpx).
- `server/tests/` — Functional tests for the REST API. Mock `graphiti-core` at the boundary; exercise real HTTP through FastAPI's ASGI stack.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `graphitiUrl` | string | `http://localhost:8000` | Graphiti REST API URL |
| `autoCapture.enabled` | boolean | `true` | Store conversations automatically |
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `5` | Max facts injected as context |

### Graph Partitioning

Each agent gets its own graph partition automatically — no configuration needed. The partition uses `ctx.agentId` (falls back to `"default"`).

The `resolveGroupId(ctx)` function in `src/config.ts` returns the group ID string for any context with an optional `agentId`.

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

# For memory mode — set memory slot in openclaw.json:
#   plugins.slots.memory = "memory-gralkor"
#
# For tool mode — enable in openclaw.json plugins list:
#   plugins.enabled = ["tool-gralkor"]

# Type-check
make typecheck

# Run all tests (plugin + server)
make test

# Run only plugin tests (TypeScript)
make test-plugin

# Run only server tests (Python) — no Docker/FalkorDB needed
make test-server

# First time only: create venv and install server test deps
make setup-server
```

## Building & Deploying

```bash
# Build a tarball for deployment
npm pack
# produces: openclaw-memory-gralkor-0.1.0.tgz

# Install from tarball on the remote host
openclaw plugins install ~/openclaw-memory-gralkor-0.1.0.tgz
```

The `files` field in `package.json` controls what goes into the tarball: `dist/`, `server/`, `openclaw.plugin.json`, `openclaw.tool-plugin.json`, `docker-compose.yml`, `config.yaml`, `.env.example`.

## Key Commands

- `make setup-server` — create venv and install server deps (first time only)
- `make test` — run all tests (plugin + server)
- `make test-plugin` — plugin tests only (vitest)
- `make test-server` — server tests only (pytest via `server/.venv`, no Docker needed)
- `make typecheck` — type-check TypeScript
- `make up` / `make down` / `make logs` — Docker services
- Graphiti host port: **8001** (avoids Coolify's 8000). Container-internal port is still 8000.
- `npm pack` — build deployment tarball

## Server Tests

Functional tests for the Graphiti REST API live in `server/tests/`. They need **no Docker, no FalkorDB, no LLM API keys**.

```bash
make setup-server   # first time only — creates server/.venv
make test-server
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
- Memory-mode tool names follow the `memory_*` pattern (matches `memory-lancedb` for slot compatibility). Tool-mode uses `graph_*` names to coexist with native `memory_*` tools.
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
