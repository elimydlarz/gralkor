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
| Tool names | `graph_search`, `graph_add` | `graph_search`, `graph_add` |
| Slot | Takes the memory slot (replaces `memory-core`) | No slot — coexists with `memory-core` |
| Hooks | `before_agent_start`, `agent_end` | Same |
| CLI | `gralkor` | `gralkor` |

**Memory mode** (`gralkor`, `kind: "memory"`): Replaces the native memory plugin. The agent gets Graphiti-powered `graph_search` and `graph_add` tools for knowledge graph access.

**Tool mode** (`gralkor`, `kind: "tool"`): Runs alongside `memory-core`. The agent keeps native `memory_search`/`memory_get` over Markdown files AND gets Graphiti-powered `graph_search`/`graph_add` tools for structured knowledge retrieval.

Both modes register the same auto-capture (`agent_end`) and auto-recall (`before_agent_start`) hooks — conversations are automatically stored and relevant facts are automatically injected regardless of which mode is active.

## Mental Model

### Domain Objects

| Object | TypeScript type | Description |
|---|---|---|
| Episode | `Episode` | A captured conversation turn or manual store. Raw text input to the graph. |
| Fact (edge) | `Fact` | An extracted relationship between two entities. Has temporal validity (`valid_at`, `invalid_at`). |
| Entity (node) | `EntityNode` | A person, concept, project, or thing extracted from episodes. Has a `summary`. |
| Group | `string` (group_id) | Partition key. One graph per agent — derived from `agentId`, falls back to `"default"`. Hooks get it from `ctx`; tools read it via shared `getGroupId` closure. |

### Plugin Registration

Both entry points follow the same sequence in their synchronous `register()` function:

1. `resolveConfig()` merges plugin config with defaults. The Graphiti URL is a hardcoded constant (`GRAPHITI_URL = "http://graphiti:8001"`) in `src/config.ts`, not user-configurable.
2. Create a `GraphitiClient` with the resolved URL.
3. Call `registerFullPlugin()` which creates shared group ID state (`getGroupId`/`setGroupId`), then registers tools (with `getGroupId`), hooks (with `setGroupId`), health service, and CLI.

Both entry points reuse the same tool factories and the same shared helpers from `src/register.ts`.

### OpenClaw Plugin API Contract

The plugin API methods must match these signatures exactly — the gateway validates arguments at registration time:

- **`registerTool(tool, opts?)`** — `tool` must be a plain object `{ name, description, parameters, execute }`. Factory functions are not supported; passing a function causes a crash (the gateway reads `tool.description.trim()`). The gateway calls `execute(toolCallId, params, signal, onUpdate)` — **not** `execute(args, ctx)`. Tools do not receive agent context; see "Graph Partitioning" for how tools resolve `group_id`.
- **`registerHook(event, handler, metadata)`** — Three arguments required. `metadata` must include `{ name: string }` (e.g. `"gralkor.auto-recall"`). The gateway does `metadata.name.trim()` — omitting the third arg crashes registration. Hook handlers receive a single `ctx` object with `{ agentId?, userMessage?, agentResponse? }`.
- **`registerService({ id, start, stop })`** — Uses `id` (not `name`), and lifecycle methods `start()`/`stop()` (not `interval`/`execute`).
- **`registerCli(registrar, opts?)`** — `registrar` receives `{ program }` (Commander instance). `opts` can include `{ commands: string[] }`.

### Data Lifecycle

**Auto-capture** (`agent_end` hook):
1. Skip if disabled, both messages <10 chars, or user message starts with `/`.
2. Format as `User: ...\nAssistant: ...`.
3. POST to `/episodes` with timestamp and agent's `group_id`.
4. Graphiti server-side extracts entities and facts from the episode.
5. On failure: swallow silently.

**Auto-recall** (`before_agent_start` hook):
1. Capture `ctx.agentId` into shared group ID state (so tools can use it).
2. Skip if disabled or no user message.
3. Extract up to 8 key terms (stop-word filtered) from user message.
4. POST to `/search` with terms and `group_id`.
5. Format returned facts as bulleted list inside `<gralkor-memory source="auto-recall" trust="untrusted">` XML.
6. Return as injected context. On failure: return nothing.

### Communication Path

All plugin → Graphiti communication goes through `GraphitiClient` (`src/client.ts`). The client never touches FalkorDB directly. The server (`server/main.py`) holds the only `Graphiti` instance and FalkorDB connection. The server creates an explicit `FalkorDriver` (from `graphiti_core.driver.falkordb_driver`) with host/port parsed from the `FALKORDB_URI` env var, and passes it to `Graphiti()` via the `graph_driver` parameter.

## Requirements

### Functional

| Requirement | Implementation |
|---|---|
| Persistent cross-conversation memory | Episodes stored in FalkorDB via Graphiti; survive restarts |
| Automatic conversation capture | `agent_end` hook stores every non-trivial exchange as an episode |
| Automatic context recall | `before_agent_start` hook injects relevant facts before each turn |
| Manual search | `graph_search` queries facts and entity nodes in parallel |
| Manual store | `graph_add` creates episodes; Graphiti extracts structure |
| Per-agent graph partitioning | `group_id` derived from `agentId` isolates each agent's knowledge; hooks capture it from `ctx`, tools read it via shared closure |
| CLI diagnostics | `gralkor status`, `gralkor search`, `gralkor clear` available for troubleshooting |
| Temporal awareness | Facts have `valid_at` / `invalid_at`; Graphiti tracks when knowledge changes |
| Graph-based memory tools | `graph_search` and `graph_add` provide knowledge graph access |
| Dual operating modes | Memory mode (replaces native memory) or tool mode (coexists with it) |

### Cross-functional

| Requirement | Implementation |
|---|---|
| Graceful degradation (unconfigured) | Graphiti URL is hardcoded to `http://graphiti:8001`; always registers full plugin |
| Graceful degradation (unreachable) | Hooks swallow errors silently; tools throw so the agent sees the failure |
| Retry with backoff | `GraphitiClient` retries network errors and 5xx up to 2 times (500ms, 1000ms); 4xx throws immediately |
| Slot compatibility | Both modes use `graph_search`/`graph_add` names — no collision with native `memory_*` tools |
| Security — untrusted context | Auto-recalled facts wrapped in `<gralkor-memory trust="untrusted">` XML |
| Health monitoring | Background service pings `/health` every 60s; logs warnings on failure |
| Message filtering | Auto-capture skips messages <10 chars and messages starting with `/` |

## Architecture

```
One repo — two published packages (produced by scripts/pack.sh)
  resources/memory/  — package.json + openclaw.plugin.json for memory tarball
  resources/tool/    — package.json + openclaw.plugin.json for tool tarball
  src/               — shared TypeScript compiled into both

OpenClaw Gateway (Node.js)
  └── gralkor plugin (one of the two packages, not both)
        ├── Tools: graph_search, graph_add
        ├── Hooks: before_agent_start (auto-recall), agent_end (auto-capture)
        ├── Service: health monitor (60s interval)
        └── CLI: gralkor status, gralkor search, gralkor clear
              │
              ▼  HTTP (fetch)
        Graphiti REST API (FastAPI, port 8001)
              │
              ▼  Redis protocol
        FalkorDB (port 6379, browser UI port 3000)
```

## File Structure

- `src/index.ts` — Memory-mode entry point (`id: "gralkor"`, `kind: "memory"`). Registers `graph_search` and `graph_add`.
- `src/tool-entry.ts` — Tool-mode entry point (`id: "gralkor"`, `kind: "tool"`). Registers `graph_search` and `graph_add`.
- `resources/memory/package.json` — Package descriptor for the memory tarball (`@openclaw/gralkor`, single extension `./dist/index.js`).
- `resources/memory/openclaw.plugin.json` — Memory-mode manifest (`kind: "memory"`). Canonical source of truth for the active `openclaw.plugin.json`.
- `resources/tool/package.json` — Package descriptor for the tool tarball (`@openclaw/gralkor`, single extension `./dist/tool-entry.js`).
- `resources/tool/openclaw.plugin.json` — Tool-mode manifest (`kind: "tool"`). Canonical source of truth for `openclaw.tool-plugin.json`.
- `scripts/pack.sh` — Build script. Builds once, then loops over `resources/{memory,tool}/`, copies the two files, runs `npm pack` each time, restores to memory state.
- `src/register.ts` — Shared registration helpers (`registerCli`, `registerHooks`, `registerHealthService`) used by both entry points.
- `src/client.ts` — `GraphitiClient` class. HTTP wrapper around the Graphiti REST API with retry logic (retries network errors and 5xx, not 4xx) and configurable timeout.
- `src/tools.ts` — Tool factories: `createMemoryRecallTool`, `createMemoryStoreTool`. Default names are `graph_search` and `graph_add`. Accept optional `ToolOverrides` and an optional `getGroupId` closure for agent partitioning. Execute signature matches OpenClaw convention: `(toolCallId, params)`.
- `src/hooks.ts` — Hook factories: `before_agent_start` (auto-recall), `agent_end` (auto-capture). Both degrade silently if Graphiti is unreachable. `before_agent_start` accepts an optional `setGroupId` callback to share the agent's group ID with tools.
- `src/config.ts` — `GRAPHITI_URL` constant, `GralkorConfig` interface, defaults, `resolveConfig()`, `resolveGroupId()`.
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
| `autoCapture.enabled` | boolean | `true` | Store conversations automatically |
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `5` | Max facts injected as context |

### Graph Partitioning

Each agent gets its own graph partition automatically — no configuration needed. Hooks receive `ctx.agentId` directly from OpenClaw. Tools don't receive agent context (OpenClaw calls `execute(toolCallId, params)` — no ctx), so each entry point creates a shared group ID: the `before_agent_start` hook captures `ctx.agentId` via a `setGroupId` callback, and tools read it via a `getGroupId` closure. Falls back to `"default"`.

The `resolveGroupId(ctx)` function in `src/config.ts` returns the group ID string for any context with an optional `agentId` (used by hooks and CLI).

### Graceful Degradation

- The Graphiti URL (`http://graphiti:8001`) is a hardcoded constant, not user-configurable. The plugin always registers the full set of tools, hooks, and services.
- If Graphiti is **unreachable at runtime**, hooks silently skip (no errors surfaced to the agent), and tools throw so the agent sees the failure.

## Environment Variables

- `OPENAI_API_KEY` — API key for OpenAI. Default LLM + embeddings provider.
- `ANTHROPIC_API_KEY` — API key for Anthropic (still needs `OPENAI_API_KEY` for embeddings).
- `GOOGLE_API_KEY` — API key for Gemini (fully self-contained: LLM + embeddings + reranking).
- `GROQ_API_KEY` — API key for Groq (still needs `OPENAI_API_KEY` for embeddings).
LLM provider is configured in `config.yaml` (`llm.provider` and `embedder.provider`). See `.env.example` for details.

## Dev Workflow

```bash
# Build the gralkor-server image and start backend services
make up

# Verify Graphiti is running
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
# produces: openclaw-gralkor-memory-x.y.z.tgz  (memory mode)
#           openclaw-gralkor-tool-x.y.z.tgz    (tool mode)

# Install from tarball on the remote host
openclaw plugins install ~/openclaw-gralkor-memory-x.y.z.tgz  # memory mode
# OR
openclaw plugins install ~/openclaw-gralkor-tool-x.y.z.tgz    # tool mode
```

The `files` field in `resources/{memory,tool}/package.json` controls what goes into each tarball: `dist/`, `server/`, `openclaw.plugin.json`, `docker-compose.yml`, `config.yaml`, `.env.example`. Each tarball contains only one manifest (`openclaw.plugin.json`), stamped by `scripts/pack.sh` before packing.

The `docker-compose.yml` references `gralkor-server:latest` (a locally-built image, not a registry image). On the deployment host, build the image from the included `server/` source before starting services:

```bash
docker build -t gralkor-server:latest server/
docker compose up -d
```

## Key Commands

- `make setup-server` — create venv and install server deps (first time only)
- `make test` — run all tests (plugin + server)
- `make test-plugin` — plugin tests only (vitest)
- `make test-server` — server tests only (pytest via `server/.venv`, no Docker needed)
- `make typecheck` — type-check TypeScript
- `make build-server` — build the `gralkor-server:latest` Docker image from `server/`
- `make up` / `make down` / `make logs` — Docker services (`up` automatically builds the image)
- Graphiti port: **8001** (both container-internal and host-mapped).
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
- Both modes use the same tool names: `graph_search` and `graph_add`.
- Config types are plain TypeScript interfaces in `src/config.ts`
- Imports use `.js` extensions (required for ESM with TypeScript)

## Gotchas

- `register()` must be synchronous. OpenClaw's gateway discards the return value of async `register()` functions — the plugin appears loaded but registers zero tools, hooks, or CLI commands. No async work (network probing, etc.) can happen inside `register()`.
- `registerHook` requires a third `metadata` argument with `{ name }`. The gateway calls `metadata.name.trim()` — omitting it causes `TypeError: Cannot read properties of undefined (reading 'trim')`.
- `registerTool` only accepts plain tool objects. Do not pass factory functions — the gateway reads `tool.description` which is `undefined` on functions.
- `registerService` uses `{ id, start, stop }`, not `{ name, interval, execute }`.
- Tool `execute` is called as `execute(toolCallId, params, signal, onUpdate)` — **not** `execute(args, ctx)`. The first arg is a string tool-call ID, not the parsed parameters. Tools do not receive agent context; use the shared `getGroupId`/`setGroupId` pattern (see Graph Partitioning) for `group_id`.
- Do not try to ship both entry points in one package. OpenClaw ≤ 2026.2.24 only supports flat string arrays in `openclaw.extensions`, so all entries inherit the same ID and `kind` from the single manifest — tool mode can never be properly activated this way. The solution is two packages from one repo (see architecture below), each with one entry point and one tailored manifest.
- Graphiti requires an LLM provider API key — without one the container starts but all operations fail
- FalkorDB must be healthy before Graphiti can start (`depends_on` in docker-compose handles this, but no healthcheck — Graphiti may need a few seconds after FalkorDB is up)
- The client retries network errors and 5xx responses (up to 2 retries with backoff) but throws immediately on 4xx client errors
- Auto-recall injects context as XML-tagged content marked `trust="untrusted"`
- Auto-capture skips messages shorter than 10 chars and messages starting with `/`

## Deployment

When deployed alongside OpenClaw on a VPS, set `FALKORDB_DATA_DIR` to colocate FalkorDB data inside OpenClaw's `/data` volume. This way existing backup/restore scripts capture graph data automatically. The `gralkor` Docker network lets the OpenClaw container reach Graphiti at `http://graphiti:8001`.

## Recommended Reading

- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/cli/memory
- https://docs.openclaw.ai/tools/plugin
- https://docs.openclaw.ai/cli/plugins
- https://docs.openclaw.ai/tools
