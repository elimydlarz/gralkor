# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

OpenClaw plugin giving AI agents persistent, temporally-aware memory via knowledge graphs (Graphiti + FalkorDB).

| | |
|---|---|
| Entry point | `src/index.ts` → `dist/index.js` |
| Plugin ID / Kind | `gralkor` / `"memory"` (replaces `memory-core`) |
| Tools | `memory_search` (unified native+graph), `memory_get` (native), `memory_add` (graph) |
| Hooks | `before_agent_start` (auto-recall), `agent_end` (auto-capture) |
| CLI | `openclaw plugins memory`, `openclaw plugins gralkor` |

## Mental Model

### Architecture

```
OpenClaw Gateway (Node.js)
  └── gralkor plugin (memory slot)
        ├── Tools + Hooks + CLI
        ├── Service: gralkor-server (manages Python subprocess + 60s health monitor)
              │ spawns child process (server-manager.ts)
              ▼
        Graphiti REST API (FastAPI, uvicorn, 127.0.0.1:8001)
              │ embedded (default) or TCP (legacy Docker via FALKORDB_URI)
              ▼
        FalkorDBLite (embedded) OR FalkorDB (external)
```

All plugin→Graphiti communication goes through `GraphitiClient` (`src/client.ts`). The server (`server/main.py`) holds the only `Graphiti` instance and FalkorDB connection.

### Domain Objects

- **Episode** — captured conversation or manual store; raw text input to the graph
- **Fact (edge)** — extracted relationship between entities; has temporal validity (`valid_at`/`invalid_at`)
- **Entity (node)** — person, concept, project, or thing; has a `summary`
- **Group** — partition key (`group_id`) derived from `agentId`; one graph per agent

### Plugin Registration

`register()` (synchronous) calls `resolveConfig()` → creates `GraphitiClient` → calls `registerFullPlugin()` which creates shared `getGroupId`/`setGroupId` state, then registers tools, hooks, server service, and CLI. The `memory_search` factory wraps native search (from `api.runtime.tools`) to also call `client.searchFacts()` in parallel.

### Data Lifecycle

**Auto-recall** (`before_agent_start`): Strips `System:` lines, session-start lines, and metadata wrappers from `event.prompt` to extract user message. Falls back to last user message from `event.messages`. Searches graph facts + native memory in parallel. Returns `{ prependContext }` wrapped in `<gralkor-memory trust="untrusted">` XML.

**Auto-capture** (`agent_end`): Extracts all text blocks from user/assistant messages. Strips `<gralkor-memory>` blocks (prevents feedback loop). Skips empty conversations and `/`-prefixed first messages. POSTs as episode to Graphiti. Errors propagate (not swallowed).

### Graph Partitioning

Tools don't receive agent context, so `before_agent_start` captures `ctx.agentId` via `setGroupId`, tools read via `getGroupId` closure. Falls back to `"default"`.

### Server Manager Lifecycle

1. `uv sync --no-dev --frozen` (creates/reuses venv)
2. Force-install bundled wheels from `server/wheels/` (arm64 falkordblite fix)
3. Spawn uvicorn on port 8001 with embedded FalkorDBLite
4. Poll `/health` every 500ms (120s timeout)
5. Monitor health every 60s

Stop: SIGTERM → 5s grace → SIGKILL. Startup errors caught (graceful degradation).

### Plugin API Contract

- **`register()` must be synchronous.** Async register appears loaded but registers nothing.
- **`registerTool(tool, opts?)`** — Plain object `{ name, description, parameters, execute }` or factory `(ctx) => Tool[]` with `opts: { names: string[] }`. Execute signature: `execute(toolCallId, params, signal, onUpdate)` — NOT `execute(args, ctx)`.
- **`api.runtime.tools`** — Built-in factories: `createMemorySearchTool()`, `createMemoryGetTool()`, `registerMemoryCli()`.
- **`api.on(event, handler)`** — Register hooks. Prefer over `registerHook` (which requires `metadata.name`).
- **`registerService({ id, start, stop })`** — NOT `{ name, interval, execute }`.
- **`registerCli(registrar, opts?)`** — Commands mount under `openclaw plugins`.

### Hook Handlers: `(event, ctx)`

| Hook | `event` | `ctx` |
|---|---|---|
| `before_agent_start` (fires **twice**) | `{ prompt, messages? }` | `{ agentId, sessionKey, sessionId, workspaceDir, messageProvider }` |
| `agent_end` (fire-and-forget) | `{ messages, success, error, durationMs }` | same |

- **Double-fire:** `before_agent_start` fires once before session creation (only `prompt`), once before LLM invocation (`prompt` + `messages`). Only second call's `prependContext` is used. Handler must be idempotent.
- **Fire-and-forget:** `agent_end` is not awaited. Errors caught by gateway `.catch()`.
- **Message format:** `event.messages[].content` is an array of `{ type, text?, ... }` objects, not strings.

## Requirements

### Functional

| Requirement | Implementation |
|---|---|
| Self-managing backend | Spawns Graphiti server as managed Python subprocess with embedded FalkorDBLite; requires `uv` on PATH |
| Persistent cross-conversation memory | Episodes stored in FalkorDB via Graphiti; survive restarts |
| Automatic conversation capture | `agent_end` hook stores every non-trivial multi-turn exchange as an episode |
| Automatic context recall | `before_agent_start` searches graph facts + native Markdown in parallel, injects combined results |
| Unified memory search | `memory_search` combines native Markdown + graph facts in a single response |
| Manual store | `memory_add` creates episodes in knowledge graph; Graphiti extracts structure |
| Per-agent graph partitioning | `group_id` from `agentId` isolates each agent's knowledge |
| CLI diagnostics | `openclaw plugins gralkor status/search/clear` (group ID always required) |
| Temporal awareness | Facts have `valid_at`/`invalid_at`; Graphiti tracks knowledge changes |

### Cross-functional

| Requirement | Implementation |
|---|---|
| Graceful degradation | Server start failures logged (plugin still loads); auto-recall skips on graph errors; auto-capture propagates errors; tools throw |
| Observability | `[gralkor]`-prefixed logs: events, result counts, skip reasons, errors. No message content logged. Uvicorn access logs disabled. |
| Retry with backoff | Client retries network errors/5xx up to 2 times (500ms, 1000ms); 4xx throws immediately |
| Security | Auto-recalled facts wrapped in `<gralkor-memory trust="untrusted">` XML |
| Capture hygiene | Strips `<gralkor-memory>` blocks before storing; skips `/`-prefixed and empty conversations |
| Prompt parsing robustness | Strips `System:` lines, session-start lines, metadata wrappers; falls back to `event.messages` |
| Query sanitization | Server-side `_sanitize_query()` strips backticks (RediSearch syntax) |
| Bundled arm64 wheel | `make pack` builds correct falkordblite wheel for linux/arm64 via Docker |

## Repo Map

```
src/
  index.ts              # entry point (kind: "memory")
  register.ts           # shared registration (tools, hooks, server service, CLI)
  tools.ts              # tool factories + formatters
  hooks.ts              # hook factories: auto-recall, auto-capture
  client.ts             # GraphitiClient — HTTP wrapper with retry
  server-manager.ts     # Python process lifecycle: uv sync, spawn, health, stop
  types.ts              # PluginApiBase, MemoryPluginApi interfaces
  config.ts             # GRAPHITI_URL, GralkorConfig, resolveConfig(), resolveGroupId()
  *.test.ts             # co-located tests for each module
server/
  main.py               # FastAPI app — thin wrapper around graphiti-core
  pyproject.toml        # uv project config
  uv.lock               # lockfile for reproducible builds
  tests/                # pytest tests (mocked Graphiti + real FalkorDBLite integration)
resources/memory/
  package.json          # @susu-eng/gralkor npm package
  openclaw.plugin.json  # canonical memory-mode manifest
scripts/pack.sh         # builds deployment tarball (+ falkordblite arm64 wheel via Docker)
```

## Configuration

| Field | Default | Description |
|---|---|---|
| `autoCapture.enabled` | `true` | Store conversations automatically |
| `autoRecall.enabled` | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | `10` | Max facts injected as context |
| `dataDir` | `{pluginDir}/.gralkor-data` | Backend data directory (venv, FalkorDB files) |

## Environment Variables

- `OPENAI_API_KEY` — Default LLM + embeddings provider
- `ANTHROPIC_API_KEY` — For Anthropic (still needs OpenAI for embeddings)
- `GOOGLE_API_KEY` — For Gemini (fully self-contained: LLM + embeddings + reranking)
- `GROQ_API_KEY` — For Groq (still needs OpenAI for embeddings)
- `FALKORDB_URI` — (Optional) `redis://host:port` for external FalkorDB (legacy Docker only)

LLM provider configured in `config.yaml`. Server manager forwards all API keys to Python subprocess.

## Key Commands

```bash
make test             # all tests (plugin + server)
make test-plugin      # vitest
make test-server      # pytest via uv
make typecheck        # TypeScript type-check
make setup-server     # sync server venv (first time)
make version-patch    # bump, commit, tag (also version-minor / version-major)
make publish          # build + pnpm publish
make pack             # deployment tarball (requires Docker for arm64 wheel)
```

## Conventions

- TypeScript ES modules, target ES2022, imports use `.js` extensions
- All Graphiti communication via HTTP (`src/client.ts`)

## Gotchas

- **Native tool `execute()` returns `{ content: [{ type: "text", text }] }`** — not a plain string. Use `unwrapToolResult()` in `src/index.ts`.
- **`falkordblite` installs as `redislite`** — `from redislite.async_falkordb_client import AsyncFalkorDB`.
- **falkordblite 0.9.0 sdist bug on aarch64:** Bundles x86-64 binary. Workaround: `scripts/pack.sh` builds correct arm64 wheel, server manager force-installs it.
- **Server manager requires `uv` on PATH.** First start is slow (~1-2 min); subsequent starts are fast.
- **Server manager does NOT set `FALKORDB_URI`** — its absence triggers embedded mode.
- **Auto-capture drops media content** — only `type === "text"` blocks are extracted.
- **Native memory returns empty in FTS-only mode** (upstream OpenClaw bug): `syncMemoryFiles()` bails when no embedding provider is configured. Workaround: set `OPENAI_API_KEY`.
- **Docker HOME split:** Gateway uses `HOME=/data`, shell uses `HOME=/root`. Fix: `ln -sfn /data/.openclaw /root/.openclaw`.
- **AbortError in auto-capture:** Observed despite no AbortSignal — likely Node HTTP layer (connection reset, process SIGTERM).

## Deployment

**Default:** Install plugin, set LLM API key, restart OpenClaw. Requires `uv` on host. Configure `dataDir` to colocate with OpenClaw's `/data` volume.

**Legacy Docker:** Set `FALKORDB_URI=redis://falkordb:6379` for external FalkorDB container.
