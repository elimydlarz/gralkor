# Gralkor — OpenClaw Memory/Tool Plugin (Graphiti + FalkorDB)

## What is this?

An OpenClaw plugin that gives AI agents persistent, temporally-aware memory via knowledge graphs.
Uses Graphiti (knowledge graph framework by Zep) backed by FalkorDB (in-memory graph database).

Gralkor ships **two packages from one repo**. Each is published independently with its own tailored manifest; the source is shared. Only one should be active at a time:

| | Memory mode | Tool mode |
|---|---|---|
| Entry point | `src/index.ts` → `dist/index.js` | `src/tool-entry.ts` → `dist/tool-entry.js` |
| Plugin ID | `gralkor` | `gralkor` |
| Kind | `"memory"` | `"tool"` |
| Tool names | `graph_memory_recall`, `graph_memory_store`, `memory_search`, `memory_get` | `graph_search`, `graph_add` |
| Slot | Takes the memory slot (replaces `memory-core`) | No slot — coexists with `memory-core` |
| Hooks | `before_agent_start`, `agent_end` | Same |
| CLI | `gralkor`, `memory` | `gralkor` |

**Memory mode** (`gralkor`, `kind: "memory"`): Replaces the native memory plugin. The agent gets Graphiti-powered graph tools AND native `memory_search`/`memory_get` for file-based memory (re-registered via `api.runtime.tools`).

**Tool mode** (`gralkor`, `kind: "tool"`): Runs alongside `memory-core`. The agent keeps native `memory_search`/`memory_get` over Markdown files AND gets Graphiti-powered `graph_search`/`graph_add` tools for structured knowledge retrieval.

Both modes register the same auto-capture (`agent_end`) and auto-recall (`before_agent_start`) hooks — conversations are automatically stored and relevant facts are automatically injected regardless of which mode is active.

## Mental Model

### Domain Objects

| Object | TypeScript type | Description |
|---|---|---|
| Episode | `Episode` | A captured conversation turn or manual store. Raw text input to the graph. |
| Fact (edge) | `Fact` | An extracted relationship between two entities. Has temporal validity (`valid_at`, `invalid_at`). |
| Entity (node) | `EntityNode` | A person, concept, project, or thing extracted from episodes. Has a `summary`. |
| Group | `string` (group_id) | Partition key. One graph per agent — `ctx.agentId`, falls back to `"default"`. |

### Plugin Registration

Both entry points follow the same sequence in their `register()` function:

1. `resolveConfig()` merges plugin config → `GRAPHITI_URL` env var → defaults.
2. If an explicit URL is found (config or env): create client, call `registerFullPlugin()` (tools + hooks + health service + CLI).
3. If no explicit URL: `probeGraphitiUrl()` tries `graphiti:8000`, `localhost:8001`, `localhost:8000` in parallel (2s timeout). First responder wins.
4. If probe succeeds: `registerFullPlugin()` with discovered URL.
5. If probe fails: register **CLI only** (`registerCli`) — no tools, no hooks.

Both entry points reuse the same tool factories (with `ToolOverrides` for name/description) and the same shared helpers from `src/register.ts`.

Memory mode additionally re-registers `memory_search` and `memory_get` via a factory callback that calls `api.runtime.tools.createMemorySearchTool()` / `createMemoryGetTool()`. This restores the file-based memory tools that would otherwise be lost when Gralkor displaces `memory-core` from the memory slot. The `memory` CLI namespace is also re-registered via `api.runtime.tools.registerMemoryCli()`.

### Data Lifecycle

**Auto-capture** (`agent_end` hook):
1. Skip if disabled, both messages <10 chars, or user message starts with `/`.
2. Format as `User: ...\nAssistant: ...`.
3. POST to `/episodes` with timestamp and agent's `group_id`.
4. Graphiti server-side extracts entities and facts from the episode.
5. On failure: swallow silently.

**Auto-recall** (`before_agent_start` hook):
1. Skip if disabled or no user message.
2. Extract up to 8 key terms (stop-word filtered) from user message.
3. POST to `/search` with terms and `group_id`.
4. Format returned facts as bulleted list inside `<gralkor-memory source="auto-recall" trust="untrusted">` XML.
5. Return as injected context. On failure: return nothing.

### Communication Path

All plugin → Graphiti communication goes through `GraphitiClient` (`src/client.ts`). The client never touches FalkorDB directly. The server (`server/main.py`) holds the only `Graphiti` instance and FalkorDB connection.

## Requirements

### Functional

| Requirement | Implementation |
|---|---|
| Persistent cross-conversation memory | Episodes stored in FalkorDB via Graphiti; survive restarts |
| Automatic conversation capture | `agent_end` hook stores every non-trivial exchange as an episode |
| Automatic context recall | `before_agent_start` hook injects relevant facts before each turn |
| Manual search | `graph_memory_recall` (memory mode) / `graph_search` (tool mode) queries facts and entity nodes in parallel |
| Manual store | `graph_memory_store` (memory mode) / `graph_add` (tool mode) creates episodes; Graphiti extracts structure |
| Per-agent graph partitioning | `group_id` derived from `ctx.agentId` isolates each agent's knowledge |
| CLI diagnostics | `gralkor status`, `gralkor search`, `gralkor clear` work even in CLI-only mode |
| Temporal awareness | Facts have `valid_at` / `invalid_at`; Graphiti tracks when knowledge changes |
| Native memory file access in memory mode | `memory_search` and `memory_get` re-registered via `api.runtime.tools`; `graph_memory_recall/store` prefix makes graph vs. file tools unambiguous |
| Dual operating modes | Memory mode (replaces native memory) or tool mode (coexists with it) |

### Cross-functional

| Requirement | Implementation |
|---|---|
| Graceful degradation (unconfigured) | No explicit URL + probe fails → CLI-only mode, no errors, no broken tools |
| Graceful degradation (unreachable) | Hooks swallow errors silently; tools throw so the agent sees the failure |
| Retry with backoff | `GraphitiClient` retries network errors and 5xx up to 2 times (500ms, 1000ms); 4xx throws immediately |
| Slot compatibility | Memory-mode graph tools use `graph_memory_*` prefix to distinguish from native file tools; `memory_search`/`memory_get` match memory-core exactly |
| Security — untrusted context | Auto-recalled facts wrapped in `<gralkor-memory trust="untrusted">` XML |
| Health monitoring | Background service pings `/health` every 60s; logs warnings on failure |
| Auto-probe discovery | On startup, probes `graphiti:8000`, `localhost:8001`, `localhost:8000` in parallel; uses first responder |
| Message filtering | Auto-capture skips messages <10 chars and messages starting with `/` |

## Architecture

```
One repo — two published packages (produced by scripts/pack.sh)
  resources/memory/  — package.json + openclaw.plugin.json for memory tarball
  resources/tool/    — package.json + openclaw.plugin.json for tool tarball
  src/               — shared TypeScript compiled into both

OpenClaw Gateway (Node.js)
  └── gralkor plugin (one of the two packages, not both)
        ├── Tools: graph_memory_recall/store + memory_search/get (memory mode)
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

- `src/index.ts` — Memory-mode entry point (`id: "gralkor"`, `kind: "memory"`). Registers `graph_memory_recall`, `graph_memory_store` (graph tools via `ToolOverrides`) and `memory_search`, `memory_get` (native file-based tools via `api.runtime.tools`). Falls back to CLI-only mode if no `graphitiUrl` is explicitly configured.
- `src/tool-entry.ts` — Tool-mode entry point (`id: "gralkor"`, `kind: "tool"`). Registers `graph_search`, `graph_add`. Same fallback behavior.
- `resources/memory/package.json` — Package descriptor for the memory tarball (`@openclaw/memory-gralkor`, single extension `./dist/index.js`).
- `resources/memory/openclaw.plugin.json` — Memory-mode manifest (`kind: "memory"`). Canonical source of truth for the active `openclaw.plugin.json`.
- `resources/tool/package.json` — Package descriptor for the tool tarball (`@openclaw/tool-gralkor`, single extension `./dist/tool-entry.js`).
- `resources/tool/openclaw.plugin.json` — Tool-mode manifest (`kind: "tool"`). Canonical source of truth for `openclaw.tool-plugin.json`.
- `scripts/pack.sh` — Build script. Builds once, then loops over `resources/{memory,tool}/`, copies the two files, runs `npm pack` each time, restores to memory state.
- `src/register.ts` — Shared registration helpers (`registerCli`, `registerHooks`, `registerHealthService`) used by both entry points.
- `src/client.ts` — `GraphitiClient` class. HTTP wrapper around the Graphiti REST API with retry logic (retries network errors and 5xx, not 4xx) and configurable timeout.
- `src/tools.ts` — Tool factories: `createMemoryRecallTool`, `createMemoryStoreTool`. Accept optional `ToolOverrides` to customize name/description (memory mode uses `graph_memory_*` names; tool mode uses `graph_*` names).
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
#   plugins.slots.memory = "gralkor"
#
# For tool mode — enable in openclaw.json plugins list:
#   plugins.enabled = ["gralkor"]

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
make pack
# produces: openclaw-memory-gralkor-x.y.z.tgz  (memory mode)
#           openclaw-tool-gralkor-x.y.z.tgz     (tool mode)

# Install from tarball on the remote host
openclaw plugins install ~/openclaw-memory-gralkor-x.y.z.tgz   # memory mode
# OR
openclaw plugins install ~/openclaw-tool-gralkor-x.y.z.tgz     # tool mode
```

The `files` field in `resources/{memory,tool}/package.json` controls what goes into each tarball: `dist/`, `server/`, `openclaw.plugin.json`, `docker-compose.yml`, `config.yaml`, `.env.example`. Each tarball contains only one manifest (`openclaw.plugin.json`), stamped by `scripts/pack.sh` before packing.

## Key Commands

- `make setup-server` — create venv and install server deps (first time only)
- `make test` — run all tests (plugin + server)
- `make test-plugin` — plugin tests only (vitest)
- `make test-server` — server tests only (pytest via `server/.venv`, no Docker needed)
- `make typecheck` — type-check TypeScript
- `make up` / `make down` / `make logs` — Docker services
- Graphiti host port: **8001** (avoids Coolify's 8000). Container-internal port is still 8000.
- `make pack` — build both deployment tarballs (memory + tool) via `scripts/pack.sh`
- `make version-patch` / `make version-minor` / `make version-major` — bump version in root + both `resources/` package.json files, then commit all three and tag `vX.Y.Z`

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
- Memory-mode graph tools use `graph_memory_*` names (via `ToolOverrides`); file tools keep their native `memory_search`/`memory_get` names. Tool-mode uses `graph_*` names to coexist with native `memory_*` tools.
- Config types are plain TypeScript interfaces in `src/config.ts`
- Imports use `.js` extensions (required for ESM with TypeScript)

## Gotchas

- Do not try to ship both entry points in one package. OpenClaw ≤ 2026.2.24 only supports flat string arrays in `openclaw.extensions`, so all entries inherit the same ID and `kind` from the single manifest — tool mode can never be properly activated this way. The solution is two packages from one repo (see architecture below), each with one entry point and one tailored manifest.
- Graphiti requires an LLM provider API key — without one the container starts but all operations fail
- FalkorDB must be healthy before Graphiti can start (`depends_on` in docker-compose handles this, but no healthcheck — Graphiti may need a few seconds after FalkorDB is up)
- The client retries network errors and 5xx responses (up to 2 retries with backoff) but throws immediately on 4xx client errors
- Auto-recall injects context as XML-tagged content marked `trust="untrusted"`
- Auto-capture skips messages shorter than 10 chars and messages starting with `/`

## Deployment

When deployed alongside OpenClaw on a VPS, set `FALKORDB_DATA_DIR` to colocate FalkorDB data inside OpenClaw's `/data` volume. This way existing backup/restore scripts capture graph data automatically. The `gralkor` Docker network lets the OpenClaw container reach Graphiti at `http://graphiti:8000` (container-internal port).

## Recommended Reading

- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/cli/memory
- https://docs.openclaw.ai/tools/plugin
- https://docs.openclaw.ai/cli/plugins
- https://docs.openclaw.ai/tools
