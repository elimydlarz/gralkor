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
| Tool names | `memory_search` (unified native+graph), `memory_get` (native), `memory_add` | `graph_search`, `graph_add` |
| Slot | Takes the memory slot (replaces `memory-core`) | No slot — coexists with `memory-core` |
| Hooks | `before_agent_start`, `agent_end` | Same |
| CLI | `memory`, `gralkor` | `gralkor` |

**Memory mode** (`gralkor`, `kind: "memory"`): Replaces the native memory plugin with a unified memory interface. The agent sees three tools: `memory_search` (searches both native Markdown files and the Graphiti knowledge graph in parallel), `memory_get` (native Markdown only), and `memory_add` (stores to the knowledge graph). Auto-recall searches both backends; auto-capture stores full multi-turn conversations to the graph.

**Tool mode** (`gralkor`, `kind: "tool"`): Runs alongside `memory-core`. The agent keeps native `memory_search`/`memory_get` over Markdown files AND gets Graphiti-powered `graph_search`/`graph_add` tools for structured knowledge retrieval.

Both modes register auto-capture (`agent_end`) and auto-recall (`before_agent_start`) hooks from the shared `hooks.ts`. Auto-capture captures full multi-turn conversations and lets Graphiti errors propagate in both modes. Auto-recall searches graph facts and entities in both modes; memory mode additionally searches native Markdown via the `getNativeSearch` closure.

## Mental Model

### Domain Objects

| Object | TypeScript type | Description |
|---|---|---|
| Episode | `Episode` | A captured conversation (all turns accumulated) or manual store. Raw text input to the graph. |
| Fact (edge) | `Fact` | An extracted relationship between two entities. Has temporal validity (`valid_at`, `invalid_at`). |
| Entity (node) | `EntityNode` | A person, concept, project, or thing extracted from episodes. Has a `summary`. |
| Group | `string` (group_id) | Partition key. One graph per agent — derived from `agentId`, falls back to `"default"`. Hooks get it from `ctx`; tools read it via shared `getGroupId` closure. |

### Plugin Registration

Both entry points follow the same sequence in their synchronous `register()` function:

1. `resolveConfig()` merges plugin config with defaults. The Graphiti URL is a hardcoded constant (`GRAPHITI_URL = "http://graphiti:8001"`) in `src/config.ts`, not user-configurable.
2. Create a `GraphitiClient` with the resolved URL.
3. Call `registerFullPlugin()` which creates shared group ID state (`getGroupId`/`setGroupId`), then registers tools (with `getGroupId`), hooks (with `setGroupId`), health service, and CLI.

**Memory mode specifics:** `registerFullPlugin` creates shared `nativeSearchFn` state. The `registerTool` factory wraps native `memory_search` (from `api.runtime.tools`) to also call `client.searchFacts()` + `client.searchNodes()` in parallel, combining all results. It also stores a reference to the native search function for the auto-recall hook to use. Registers `memory_add` (via `createMemoryStoreTool` with name override) as a plain tool. Registers `memory_get` unchanged. Passes `getNativeSearch` closure to `registerHooks` so auto-recall can search both backends.

**Tool mode specifics:** `registerFullPlugin` registers `graph_search` and `graph_add` as plain tools using the default names from `createMemoryRecallTool`/`createMemoryStoreTool`. No wrapping or native memory integration.

Both entry points reuse the same tool factories (`src/tools.ts`) and shared helpers from `src/register.ts`.

### OpenClaw Plugin API Contract

The plugin API methods must match these signatures exactly — the gateway validates arguments at registration time:

- **`registerTool(tool, opts?)`** — Two forms: (1) Plain object `{ name, description, parameters, execute }` for static tools. The gateway calls `execute(toolCallId, params, signal, onUpdate)` — **not** `execute(args, ctx)`. (2) Factory function `(ctx) => AnyAgentTool | AnyAgentTool[] | null` with `opts: { names: string[] }`. The factory receives `ctx` with `{ config, workspaceDir, agentId, sessionKey, ... }` at agent start. Used for native memory tools via `api.runtime.tools`. Static tools do not receive agent context; see "Graph Partitioning" for how they resolve `group_id`.
- **`api.runtime.tools`** — Provides access to OpenClaw's built-in tool factories: `createMemorySearchTool({ config, agentSessionKey })`, `createMemoryGetTool({ config, agentSessionKey })`, `registerMemoryCli(program)`. Memory-mode plugins use these to delegate native `memory_search`/`memory_get` to the same infrastructure `memory-core` uses.
- **`api.on(event, handler)`** — Registers a hook handler. Alternatively, `registerHook(event, handler, metadata)` takes a third `metadata` arg with `{ name: string }` — the gateway does `metadata.name.trim()` so omitting it crashes. Our code uses `api.on` (no metadata needed). **Hook handlers receive two arguments: `(event, ctx)`** where `event` contains hook-specific data and `ctx` contains agent identity (see "Hook Context Shape" below).
- **`registerService({ id, start, stop })`** — Uses `id` (not `name`), and lifecycle methods `start()`/`stop()` (not `interval`/`execute`).
- **`registerCli(registrar, opts?)`** — `registrar` receives `{ program }` (Commander instance). `opts` can include `{ commands: string[] }`.

### Hook Context Shape

Hook handlers receive **two arguments: `(event, ctx)`**:

- **`event`** — Hook-specific data (varies per hook type).
- **`ctx`** (`PluginHookAgentContext`) — Agent identity, consistent across all hooks: `{ agentId?, sessionKey?, sessionId?, workspaceDir?, messageProvider? }`.

| Hook | `event` keys | `ctx` keys |
|---|---|---|
| `before_agent_start` (1st call) | `{ prompt }` | `{ agentId, sessionKey, sessionId, workspaceDir, messageProvider }` |
| `before_agent_start` (2nd call) | `{ prompt, messages }` | same |
| `agent_end` | `{ messages, success, error, durationMs }` | same |

**Double-fire:** The gateway calls `before_agent_start` **twice** per agent run — once before session creation (only `prompt` in event), once before LLM invocation (`prompt` + `messages`). Both calls receive the same `prompt` string. The handler must be idempotent. Only the return value of the second call's `prependContext` is used by the gateway.

**Message content format:** `event.messages[].content` is an array of `{ type, text?, ... }` objects (not a JSON string). The `type` field is `"text"`, `"toolCall"`, etc. Debug output shows `contentType: 'object'` confirming it's a parsed array.

**Agent identity:** `ctx.agentId` is the per-agent unique identifier, derived from the session key. Use this for graph partitioning (`group_id`). The `ctx.sessionKey` is also available as an alternative partition key.

### Data Lifecycle

**Auto-capture** (`agent_end` hook):
1. Handler receives `(event, ctx)` where `event` has `{ messages, success, error, durationMs }` and `ctx` has `{ agentId, sessionKey, ... }`.
2. `extractMessagesFromCtx()` walks `event.messages` array, extracts ALL text blocks from user and assistant messages in sequence (accumulates, does not overwrite). Strips `<gralkor-memory>` XML blocks from user messages before including them, preventing the feedback loop where auto-recall context gets re-ingested.
3. Skip if disabled, no messages extracted, or first user message starts with `/`.
4. Format as multi-turn conversation: `User: ...\nAssistant: ...\nUser: ...\nAssistant: ...`.
5. POST to `/episodes` with timestamp and agent's `group_id` (from `ctx.agentId`).
6. Graphiti server-side extracts entities and facts from the episode.
7. On failure: error propagates to the gateway (not swallowed).

**Auto-recall** (`before_agent_start` hook):
1. Handler receives `(event, ctx)` where `event` has `{ prompt, messages? }` and `ctx` has `{ agentId, sessionKey, ... }`.
2. `extractUserMessageFromPrompt()` strips leading `System:` event lines, then strips metadata wrapper from `event.prompt`, skips system prompts.
3. Capture `ctx.agentId` into shared group ID state (for tools to use).
4. Skip if disabled or no user message.
5. Run searches in parallel: `client.searchFacts()` and `client.searchNodes()` (both modes), plus native `memory_search` if available via `getNativeSearch` closure (memory mode only).
6. Format results in sections (graph facts, graph entities, native memory) inside `<gralkor-memory source="auto-recall" trust="untrusted">` XML.
7. Return as `{ prependContext }`. On graph failure: log warning, return nothing. Native search failures are caught independently and logged.

### Native Memory Indexing Pipeline (OpenClaw internals)

Understanding how native `memory_search` works is important for memory mode, since gralkor wraps the native tool via `api.runtime.tools.createMemorySearchTool()`.

**Architecture:** `createMemorySearchTool()` (in `src/agents/tools/memory-tool.ts`) calls `getMemorySearchManager()` on each execute, which lazily creates a `MemoryIndexManager` singleton. The manager uses SQLite with FTS5 for keyword search and optional vector embeddings for semantic search.

**Indexing is lazy:** The manager constructor creates the schema (empty tables) and sets `dirty = true`, but does **not** index files. Indexing is triggered by:
1. `manager.search()` — if `sync.onSearch` is true (default) and `dirty` flag is set, calls `sync()` before searching
2. `manager.warmSession()` — called at session start if `sync.onSessionStart` is true (default)
3. File watcher — `chokidar` watches `MEMORY.md` and `memory/*.md` for changes (debounced 15s)

**Known issue (OpenClaw bug):** In FTS-only mode (no embedding provider API key configured), `syncMemoryFiles()` in `manager-sync-ops.ts` returns immediately without indexing: `if (!this.provider) return;`. The same guard exists in `indexFile()`. This means the FTS table is never populated, so `memory_search` always returns empty results in FTS-only mode despite the search path supporting BM25 keyword queries. **Workaround:** configure an embedding provider (e.g. set `OPENAI_API_KEY`) so the full indexing pipeline runs. The FTS table gets populated as a side effect of the embedding indexing path.

**Manager caching:** `MemoryIndexManager` instances are cached by `agentId:workspaceDir:settings` key in a module-level `Map`. Once created, the same manager is reused for all searches within that agent.

### Communication Path

All plugin → Graphiti communication goes through `GraphitiClient` (`src/client.ts`). The client never touches FalkorDB directly. The server (`server/main.py`) holds the only `Graphiti` instance and FalkorDB connection. The server creates an explicit `FalkorDriver` (from `graphiti_core.driver.falkordb_driver`) with host/port parsed from the `FALKORDB_URI` env var, and passes it to `Graphiti()` via the `graph_driver` parameter.

## Requirements

### Functional

| Requirement | Implementation |
|---|---|
| Persistent cross-conversation memory | Episodes stored in FalkorDB via Graphiti; survive restarts |
| Automatic conversation capture | `agent_end` hook stores every non-trivial exchange as an episode; captures ALL messages in sequence (multi-turn), not just the last of each role |
| Automatic context recall | `before_agent_start` hook searches graph facts and graph entities in parallel in both modes; memory mode additionally searches native Markdown. Injects combined results before each turn. |
| Unified memory search (memory mode) | `memory_search` combines native Markdown results with graph facts and entity nodes in a single response |
| Manual store (memory mode) | `memory_add` creates episodes in the knowledge graph; Graphiti extracts structure |
| Graph tools (tool mode) | `graph_search` queries facts and entity nodes in parallel; `graph_add` creates episodes |
| Per-agent graph partitioning | `group_id` derived from `agentId` isolates each agent's knowledge; hooks capture it from `ctx`, tools read it via shared closure |
| CLI diagnostics | `gralkor status`, `gralkor search`, `gralkor clear` available for troubleshooting |
| Temporal awareness | Facts have `valid_at` / `invalid_at`; Graphiti tracks when knowledge changes |
| Native memory tools (memory mode) | `memory_search` wraps native search with graph search; `memory_get` delegated to OpenClaw runtime via `api.runtime.tools` |
| Error propagation (auto-capture) | `agent_end` hook lets Graphiti errors propagate to the gateway instead of swallowing them |
| Dual operating modes | Memory mode (replaces native memory with unified interface) or tool mode (coexists with native memory) |

### Cross-functional

| Requirement | Implementation |
|---|---|
| Graceful degradation (unconfigured) | Graphiti URL is hardcoded to `http://graphiti:8001`; always registers full plugin |
| Graceful degradation (unreachable) | Auto-recall hook logs warnings and skips on graph errors; native search failures caught independently. Auto-capture lets errors propagate. Tools throw so the agent sees the failure. |
| Observability | Hooks and tools log `[gralkor]`-prefixed messages: hook-fired events (structural metadata only), result counts, skip reasons, errors. Message bodies and user content are never logged. |
| Retry with backoff | `GraphitiClient` retries network errors and 5xx up to 2 times (500ms, 1000ms); 4xx throws immediately |
| Slot compatibility | Memory mode provides unified `memory_search` (native+graph), `memory_get` (native), and `memory_add` (graph); tool mode adds `graph_search`/`graph_add` alongside `memory-core` |
| Security — untrusted context | Auto-recalled facts wrapped in `<gralkor-memory trust="untrusted">` XML |
| Health monitoring | Background service pings `/health` every 60s; logs warnings on failure |
| Message filtering | Auto-capture skips empty conversations and conversations where the first user message starts with `/` |
| Capture hygiene | Auto-capture strips injected `<gralkor-memory>` XML from user messages before storing episodes, preventing a feedback loop where recalled facts are re-ingested as new knowledge |
| Prompt parsing robustness | Auto-recall correctly detects system prompts even when queued events (e.g. Telegram reactions) are prepended to `ctx.prompt` |

## Architecture

```
One repo — two published packages (produced by scripts/pack.sh)
  resources/memory/  — package.json + openclaw.plugin.json for memory tarball
  resources/tool/    — package.json + openclaw.plugin.json for tool tarball
  src/               — shared TypeScript compiled into both

OpenClaw Gateway (Node.js)
  └── gralkor plugin (one of the two packages, not both)
        ├── Tools: memory_search (unified), memory_get (native), memory_add (memory mode)
        │          graph_search, graph_add (tool mode)
        ├── Hooks: before_agent_start (auto-recall), agent_end (auto-capture)
        ├── Service: health monitor (60s interval)
        ├── CLI: memory (native), gralkor status, gralkor search, gralkor clear
              │
              ▼  HTTP (fetch)
        Graphiti REST API (FastAPI, port 8001)
              │
              ▼  Redis protocol
        FalkorDB (port 6379, browser UI port 3000)
```

## Repo Map

```
├── CLAUDE.md
├── README.md                        # install instructions (agent-facing, concise)
├── .humans/
│   └── README.md                    # install instructions (human-facing, detailed)
├── Makefile                          # build/test/deploy commands
├── package.json                      # root package (dev deps, scripts)
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.json
├── config.yaml                       # LLM/embedder provider config
├── docker-compose.yml                # FalkorDB + Graphiti backend services
├── .env.example
├── openclaw.plugin.json              # active memory-mode manifest (copied from resources/)
├── openclaw.tool-plugin.json         # active tool-mode manifest (copied from resources/)
│
├── src/                              # TypeScript plugin source (shared by both modes)
│   ├── index.ts                      # memory-mode entry point (kind: "memory")
│   ├── index.test.ts
│   ├── tool-entry.ts                 # tool-mode entry point (kind: "tool")
│   ├── tool-entry.test.ts
│   ├── register.ts                   # shared registration (tools, hooks, health, CLI)
│   ├── tools.ts                      # tool factories + formatters: createMemoryRecallTool, createMemoryStoreTool, formatFacts, formatNodes
│   ├── tools.test.ts
│   ├── hooks.ts                      # hook factories: auto-recall, auto-capture
│   ├── hooks.test.ts
│   ├── client.ts                     # GraphitiClient — HTTP wrapper with retry
│   ├── client.test.ts
│   ├── types.ts                      # Shared PluginApiBase, ToolPluginApi, MemoryPluginApi interfaces
│   ├── config.ts                     # GRAPHITI_URL, GralkorConfig, resolveConfig(), resolveGroupId()
│   └── config.test.ts
│
├── resources/                        # per-mode packaging manifests (used by pack.sh)
│   ├── memory/
│   │   ├── package.json              # @susu-eng/gralkor — extension: ./dist/index.js
│   │   └── openclaw.plugin.json      # canonical memory-mode manifest
│   └── tool/
│       ├── package.json              # @openclaw/gralkor — extension: ./dist/tool-entry.js
│       └── openclaw.plugin.json      # canonical tool-mode manifest
│
├── scripts/
│   └── pack.sh                       # builds both tarballs (memory + tool)
│
├── server/                           # Graphiti REST API (Python/FastAPI)
│   ├── Dockerfile
│   ├── main.py                       # FastAPI app — thin wrapper around graphiti-core
│   ├── requirements.txt              # runtime deps
│   ├── requirements-dev.txt          # test deps (pytest, httpx)
│   ├── pytest.ini
│   └── tests/
│       ├── conftest.py               # AsyncMock Graphiti + factory helpers
│       ├── test_health.py            # GET /health
│       ├── test_episodes.py          # POST/GET/DELETE /episodes
│       ├── test_search.py            # POST /search, /search/nodes
│       └── test_graph_ops.py         # DELETE /edges, POST /clear, /build-indices, /build-communities
│
└── dist/                             # compiled JS (git-ignored)
```

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `autoCapture.enabled` | boolean | `true` | Store conversations automatically |
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `5` | Max facts injected as context |

### Graph Partitioning

Each agent gets its own graph partition automatically — no configuration needed. Tools don't receive agent context (OpenClaw calls `execute(toolCallId, params)` — no ctx), so each entry point creates a shared group ID: the `before_agent_start` hook captures the agent ID from `ctx.agentId` (second argument) via a `setGroupId` callback, and tools read it via a `getGroupId` closure. Falls back to `"default"` if `agentId` is absent.

The `resolveGroupId(ctx)` function in `src/config.ts` returns the group ID string for any context with an optional `agentId` (used by hooks and CLI).

### Graceful Degradation

- The Graphiti URL (`http://graphiti:8001`) is a hardcoded constant, not user-configurable. The plugin always registers the full set of tools, hooks, and services.
- If Graphiti is **unreachable at runtime**: auto-recall logs a warning and skips (no errors surfaced to the agent), auto-capture lets errors propagate to the gateway, and tools throw so the agent sees the failure.

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

### Publishing to npm

The package is published as `@susu-eng/gralkor` (memory mode only). To publish:

```bash
make version-patch   # or version-minor / version-major — bumps, commits, and tags
make publish         # builds TypeScript and runs pnpm publish --access public
git push && git push --tags
```

Prerequisite: `npm login` with an account that has publish access to the `@susu-eng` scope.

### Tarball installs

```bash
make pack
# produces: susu-eng-gralkor-memory-x.y.z.tgz  (memory mode)
#           susu-eng-gralkor-tool-x.y.z.tgz    (tool mode)

# Install from tarball on the remote host
openclaw plugins install ~/susu-eng-gralkor-memory-x.y.z.tgz  # memory mode
# OR
openclaw plugins install ~/susu-eng-gralkor-tool-x.y.z.tgz    # tool mode
```

The `files` field in `resources/{memory,tool}/package.json` controls what goes into each tarball: `dist/`, `server/Dockerfile`, `server/main.py`, `server/requirements.txt`, `openclaw.plugin.json`, `docker-compose.yml`, `config.yaml`, `.env.example`. Each tarball contains only one manifest (`openclaw.plugin.json`), stamped by `scripts/pack.sh` before packing.

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
- `make publish` — build TypeScript and publish `@susu-eng/gralkor` to npm
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
- Memory mode provides `memory_search` (unified native+graph), `memory_get` (native), `memory_add` (graph). Tool mode provides `graph_search`, `graph_add`.
- Config types are plain TypeScript interfaces in `src/config.ts`
- Imports use `.js` extensions (required for ESM with TypeScript)

## Gotchas

- `register()` must be synchronous. OpenClaw's gateway discards the return value of async `register()` functions — the plugin appears loaded but registers zero tools, hooks, or CLI commands. No async work (network probing, etc.) can happen inside `register()`.
- `registerHook` requires a third `metadata` argument with `{ name }`. The gateway calls `metadata.name.trim()` — omitting it causes `TypeError: Cannot read properties of undefined (reading 'trim')`. Use `api.on(event, handler)` instead to avoid this.
- Hook handlers receive **two arguments: `(event, ctx)`**. The `event` contains hook-specific data (`{ prompt, messages? }` for `before_agent_start`, `{ messages, success, error, durationMs }` for `agent_end`). The `ctx` contains agent identity (`{ agentId, sessionKey, sessionId, workspaceDir, messageProvider }`). See "Hook Context Shape" in Mental Model for the full table.
- The gateway fires `before_agent_start` **twice** per agent run — once before session creation (only `prompt` in ctx), once before LLM invocation (`prompt` + `messages`). Both calls receive the same `prompt` string. Handlers must be idempotent; only the second call's `prependContext` return value is used by the gateway.
- `registerTool` accepts both plain tool objects and factory functions. Factory functions must be passed with `{ names: string[] }` opts so the gateway knows which tools they provide. The factory receives a `ctx` with `{ config, sessionKey, agentId, ... }` at agent start. Used for native memory tools via `api.runtime.tools`.
- `registerService` uses `{ id, start, stop }`, not `{ name, interval, execute }`.
- Tool `execute` is called as `execute(toolCallId, params, signal, onUpdate)` — **not** `execute(args, ctx)`. The first arg is a string tool-call ID, not the parsed parameters. Tools do not receive agent context; use the shared `getGroupId`/`setGroupId` pattern (see Graph Partitioning) for `group_id`.
- Do not try to ship both entry points in one package. OpenClaw ≤ 2026.2.24 only supports flat string arrays in `openclaw.extensions`, so all entries inherit the same ID and `kind` from the single manifest — tool mode can never be properly activated this way. The solution is two packages from one repo (see architecture below), each with one entry point and one tailored manifest.
- Graphiti requires an LLM provider API key — without one the container starts but all operations fail
- FalkorDB must be healthy before Graphiti can start (`depends_on` in docker-compose handles this, but no healthcheck — Graphiti may need a few seconds after FalkorDB is up)
- The client retries network errors and 5xx responses (up to 2 retries with backoff) but throws immediately on 4xx client errors
- Auto-recall injects context as XML-tagged content marked `trust="untrusted"`
- Auto-capture skips empty conversations and conversations where the first user message starts with `/`
- Auto-capture errors propagate to the gateway (not swallowed) — this is intentional so failures are visible
- Auto-capture strips `<gralkor-memory>` XML blocks from user messages before storing episodes, preventing a feedback loop where auto-recall context gets re-ingested as new knowledge
- Auto-recall strips leading `System: ...` event lines from `ctx.prompt` before checking for session startup instructions, so queued gateway events (e.g. Telegram reactions) don't break prompt detection
- Native tool `execute()` returns `{ content: [{ type: "text", text: "..." }, ...] }` (content-block format), **not** a plain string. Any code that calls `originalExecute` on a native tool must unwrap the result — use `unwrapToolResult()` in `src/index.ts`. Passing the raw return value to string interpolation produces `[object Object]`.
- In memory mode, `memory_search` wraps the native tool's `execute` to also search the graph — the native search function reference is captured in a closure at factory creation time and shared with the auto-recall hook via `getNativeSearch`
- **Native memory returns empty in FTS-only mode** (upstream OpenClaw bug): When no embedding provider API key is configured, `MemoryIndexManager` falls back to FTS-only mode but `syncMemoryFiles()` and `indexFile()` both bail out with `if (!this.provider) return;`, so the `chunks` and `chunks_fts` tables are never populated. The schema gets created (empty tables exist) but no files are indexed. The FTS-only search path in `manager.search()` then finds nothing. This affects both `memory_search` (via the native tool delegate) and auto-recall (via `getNativeSearch`). See "Native Memory Indexing Pipeline" in Mental Model for details and workaround.

## Deployment

When deployed alongside OpenClaw on a VPS, set `FALKORDB_DATA_DIR` to colocate FalkorDB data inside OpenClaw's `/data` volume. This way existing backup/restore scripts capture graph data automatically. The `gralkor` Docker network lets the OpenClaw container reach Graphiti at `http://graphiti:8001`.

## Recommended Reading

- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/cli/memory
- https://docs.openclaw.ai/tools/plugin
- https://docs.openclaw.ai/cli/plugins
- https://docs.openclaw.ai/tools
