# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

## What is this?

An OpenClaw plugin that gives AI agents persistent, temporally-aware memory via knowledge graphs. Uses Graphiti (knowledge graph framework by Zep) backed by FalkorDB (in-memory graph database).

A memory plugin (`kind: "memory"`) replacing native `memory-core` with three tools: `memory_search` (unified native Markdown + Graphiti graph), `memory_get` (native Markdown only), `memory_add` (knowledge graph). Auto-recall searches both backends before each turn; auto-capture buffers session messages and flushes a single episode per session at session boundaries.

| | |
|---|---|
| Entry point | `src/index.ts` → `dist/index.js` |
| Plugin ID / Kind | `gralkor` / `"memory"` |
| Tools | `memory_search` (unified), `memory_get` (native), `memory_add` (graph) |
| Hooks | `before_agent_start` (auto-recall), `agent_end`/`session_end` (auto-capture) |
| CLI | `openclaw plugins memory`, `openclaw plugins gralkor` |

## Mental Model

### Domain Objects

| Object | Type | Description |
|---|---|---|
| Episode | `Episode` | Captured conversation or manual store. Raw text input to the graph. Has `source` (EpisodeType: `message` for auto-capture, `text` for manual `memory_add`) and `source_description` (freeform provenance string). |
| Fact (edge) | `Fact` | Extracted relationship between entities. Has 4 timestamps: `created_at` (when extracted), `valid_at`/`invalid_at` (temporal validity window), `expired_at` (edge superseded). All formatted by `formatFact()` in `src/tools.ts`. |
| Entity (node) | (Graphiti-internal) | Person, concept, project, or thing extracted from episodes. Has a `summary`. Not exposed by our search endpoint — Graphiti's `search_()` API can return these but we use the simpler `search()` which returns only edges. |
| Community | (Graphiti-internal) | Cluster of related entities. Has `name` and `summary`. Built via Graphiti's `build_communities()`. Not exposed by our search endpoint. |
| Group | `string` | Partition key derived from `agentId` (falls back to `"default"`). One graph per agent. |
| SessionBuffer | `SessionBuffer` | In-memory buffer holding latest `messages` snapshot for a session. Keyed by `sessionKey \|\| agentId \|\| "default"`. Flushed as episode on session boundary. |

### Plugin Registration

`register(api)` is synchronous (async register silently registers nothing — gateway discards the return value). OpenClaw calls `register(api)` with a **single argument** — the plugin API object. Plugin-specific config from `plugins.entries.<id>.config` is on **`api.pluginConfig`** (not a second argument). Sequence:

1. Read `api.pluginConfig`, pass to `resolveConfig()` which merges with defaults, passing through `llm`/`embedder` fields. Graphiti URL is hardcoded: `http://127.0.0.1:8001`.
2. Create `GraphitiClient`, resolve `pluginDir` from `import.meta.url`.
3. `registerFullPlugin()` creates shared state (`getGroupId`/`setGroupId`, `getNativeSearch`/`setNativeSearch`, `serverReady` gate), then registers tools, hooks, server service, and CLI.

The tool factory wraps native `memory_search` (from `api.runtime.tools`) to also call `client.search()` in parallel. The native search reference is shared with auto-recall via closure.

### Plugin API Contract

- **`api.pluginConfig`** — `Record<string, unknown> | undefined`. The validated config object from `plugins.entries.<id>.config` in the user's OpenClaw config. This is how plugin-specific settings (e.g. `test`, `autoRecall`, `llm`) reach the plugin. **Not** passed as a second argument to `register()`.
- **`registerTool(tool, opts?)`** — (1) Plain object `{ name, description, parameters, execute }` where `execute(toolCallId, params, signal, onUpdate)` (**not** `execute(args, ctx)` — first arg is string ID, not params). (2) Factory `(ctx) => Tool | Tool[] | null` with `opts: { names: string[] }`. Factory receives `{ config, workspaceDir, agentId, sessionKey, ... }`.
- **`api.runtime.tools`** — Built-in tool factories: `createMemorySearchTool()`, `createMemoryGetTool()`, `registerMemoryCli()`.
- **`api.on(event, handler)`** — Register hook handler. Prefer over `registerHook` (which requires `metadata: { name }` or crashes with `TypeError`).
- **`registerService({ id, start, stop })`** — Uses `id` (not `name`), `start`/`stop` (not `interval`/`execute`).
- **`registerCli(registrar, opts?)`** — Commands mount under `openclaw plugins` (not top-level).

Other API: `api.runtime.{media, config, system, tts, channel, logging, state}`. No LLM inference API — plugins needing LLM must call external APIs directly.

### Hook Behavior

Handlers receive **`(event, ctx)`** where `ctx` (`PluginHookAgentContext`) has `{ agentId?, sessionKey?, sessionId?, workspaceDir?, messageProvider? }`. Session hooks receive `PluginHookSessionContext` with `{ agentId?, sessionId, sessionKey? }`.

**All available OpenClaw hooks** (source: `/tmp/openclaw/src/plugins/types.ts`):

| Category | Hook | `event` shape | Execution | Notes |
|---|---|---|---|---|
| Agent | `before_model_resolve` | `{ provider?, model? }` | Sequential | Override provider/model before resolution |
| Agent | `before_prompt_build` | `{ prompt, messages? }` | Sequential | Inject context before prompt submission |
| Agent | `before_agent_start` | `{ prompt, messages? }` | Sequential | Legacy — combines model resolve + prompt build. Fires **twice** per run; only 2nd call's `prependContext` is used. Must be idempotent. |
| Agent | `llm_input` | LLM payload | Fire-and-forget | Read-only observation of LLM input |
| Agent | `llm_output` | LLM payload | Fire-and-forget | Read-only observation of LLM output |
| Agent | `agent_end` | `{ messages, success, error, durationMs }` | Fire-and-forget | Fires after **every agent run** (each user message → response cycle), not per session. Gateway doesn't await. `AbortError` observed from Node HTTP layer. |
| Compaction | `before_compaction` | `{ sessionFile? }` | Fire-and-forget | Fires before message compaction; `sessionFile` available for async reads |
| Compaction | `after_compaction` | `{ ... }` | Fire-and-forget | Fires after compaction completes |
| Compaction | `before_reset` | `{ sessionFile?, messages?, reason? }` | Fire-and-forget | Fires on `/new` or `/reset` **before messages are lost**. Has full `messages` array. |
| Message | `message_received` | `{ ... }` | Fire-and-forget | Incoming message observation |
| Message | `message_sending` | `{ ... }` | Sequential | Can modify or cancel outgoing messages |
| Message | `message_sent` | `{ ... }` | Fire-and-forget | Outgoing message observation |
| Tool | `before_tool_call` | `{ ... }` | Sequential | Can modify or block tool calls |
| Tool | `after_tool_call` | `{ ... }` | Fire-and-forget | Tool call completion observation |
| Tool | `tool_result_persist` | `{ ... }` | **Synchronous** | Hot path — must not return Promise |
| Tool | `before_message_write` | `{ ... }` | **Synchronous** | Hot path — must not return Promise |
| Session | `session_start` | `{ sessionId, sessionKey?, resumedFrom? }` | Fire-and-forget | New session created |
| Session | `session_end` | `{ sessionId, sessionKey?, messageCount, durationMs? }` | Fire-and-forget | Session replaced or reset. **No messages payload** — metadata only. Fires when `isNewSession=true` and previous session exists. |
| Subagent | `subagent_spawning` | `{ ... }` | Sequential | Before subagent spawn |
| Subagent | `subagent_delivery_target` | `{ ... }` | Sequential | Message routing for subagent |
| Subagent | `subagent_spawned` | `{ ... }` | Fire-and-forget | After subagent spawned |
| Subagent | `subagent_ended` | `{ ... }` | Fire-and-forget | Subagent completed |
| Gateway | `gateway_start` | `{ ... }` | Fire-and-forget | Gateway process started |
| Gateway | `gateway_stop` | `{ ... }` | Fire-and-forget | Gateway process shutting down |

**Hooks used by gralkor:** `before_agent_start` (auto-recall), `agent_end` + `session_end` (auto-capture with session buffering).

`event.messages[].content` is an array of `{ type, text?, ... }` objects (not JSON string). Types: `"text"`, `"output_text"`, `"thinking"`, `"toolCall"`, `"toolUse"`, `"functionCall"`, etc. Auto-capture extracts `text`/`output_text` blocks into the episode body and collects `thinking` blocks separately for server-side distillation; tool-related blocks are skipped.

### Data Lifecycle

**Auto-recall** (`before_agent_start`):
1. Extract user message from `event.prompt`: strips `System:` lines, session-start lines (`"A new session was started..."`), metadata wrappers (`/^.+?\(untrusted metadata\):/`). Falls back to last user message from `event.messages` if prompt yields nothing. Strips `<gralkor-memory>` blocks from fallback.
2. Capture `ctx.agentId` into shared group ID state.
3. Skip if disabled or no user message.
4. **Double-fire dedup:** `before_agent_start` fires twice per agent run (OpenClaw behavior). The handler caches the result from the 1st fire for 5 seconds; if the same query arrives within that window, it returns the cached result without making API calls. This halves per-turn search cost.
5. **Server readiness check:** If `serverReady.isReady()` is false, graph search is skipped entirely (no fetch attempt). Context includes *"Gralkor is still booting, but memory will be available soon."* Native search still runs. Same gate used by `memory_search` and `memory_add` tools.
6. Search `client.search()` (facts only — uses `graphiti.search()` edge-based hybrid) and native `memory_search` in parallel.
7. Include facts in context. Return in `<gralkor-memory source="auto-recall" trust="untrusted">` XML as `{ prependContext }`.
8. On graph failure: log warning, skip. Native failures caught independently.

**Auto-capture** (session buffering via `agent_end` → flush on `session_end`):
1. `agent_end` fires after every agent run (each user message → response cycle). `event.messages` is the **full session message array** (`activeSession.messages` in OpenClaw) — all turns accumulated in the session, not just the current turn. However, if context-window compaction has occurred, earlier messages may be replaced with compacted summaries.
2. `agent_end` handler buffers `event.messages` into a `SessionBufferMap` keyed by `sessionKey || agentId || "default"`. Each buffer entry **replaces** the previous (latest snapshot wins — correct because each `agent_end` delivers the cumulative session state).
3. `agent_end` handler resets an idle timer (`setTimeout` with `unref()`) for the buffer key. If no further `agent_end` or `session_end` fires within `idleTimeoutMs` (default 5 min), the timer flushes the buffer. The timer is stored in an `IdleTimerMap` keyed by buffer key.
4. `session_end` handler cancels any idle timer for the key, then flushes the buffer via `flushSessionBuffer()`. Race safety: both `session_end` and idle timeout check `buffers.get(key)` — if null, the other racer already flushed, so they no-op. `flushSessionBuffer` synchronously calls `buffers.delete(key)` before any `await`, making the claim atomic in single-threaded JS.
5. `flushSessionBuffer()` calls `extractMessagesFromCtx()` which walks messages. For user messages: joins all `text`/`output_text` blocks, then `cleanUserMessageText()` strips system noise — session-start instructions (messages starting with `"A new session was started"` are dropped entirely), metadata wrappers (`Xxx (untrusted metadata):\n```json\n...\n```\n\n` — multiple blocks supported), and `<gralkor-memory>` XML. For assistant messages: iterates blocks individually — `text`/`output_text` → `Assistant: {text}`, `thinking` → `Assistant: (thinking: {text})` truncated to `maxThinkingChars` (default 2000), tool-related blocks (`toolCall`/`toolUse`/`functionCall`) skipped. **Silently drops media** (images, video).
6. Skip if disabled or empty (no text extracted).
7. Format as `User: ...\nAssistant: ...` multi-turn, POST to `/episodes` with `reference_time` set to wall-clock time.
8. Buffer is deleted before the API call (so errors don't leave stale entries).
9. `addEpisode` is retried up to 3 times with exponential backoff (1s/2s/4s) for transient errors (network, 5xx, `AbortError`). 4xx client errors are not retried. After exhaustion, the last error propagates to callers.

**Unrecoverable edge case:** If the process terminates before either `session_end` or the idle timer fires, buffered messages are lost. The idle timer uses `unref()` so it doesn't block Node shutdown.

### Graph Partitioning

Tools don't receive agent context (OpenClaw calls `execute(toolCallId, params)` — no ctx). The `before_agent_start` hook captures `ctx.agentId` via `setGroupId`, tools read via `getGroupId`. `resolveGroupId(ctx)` in `src/config.ts` handles this for hooks/CLI.

### Server Manager Lifecycle

Managed via `src/server-manager.ts`, registered as service `gralkor-server`:

1. `uv sync --no-dev --frozen --directory {serverDir}` with `UV_PROJECT_ENVIRONMENT={dataDir}/venv`
2. Force-install bundled wheels from `server/wheels/` (if any) via `uv pip install --reinstall --no-deps` — bypasses lockfile hash verification. Incompatible wheels caught gracefully.
3. Write dynamic `config.yaml` to `dataDir` from plugin settings (`llm`/`embedder`) with defaults (`gemini-3-flash-preview`, `gemini-embedding-2-preview`). Spawn `{venvPython} -m uvicorn main:app --host 127.0.0.1 --port 8001 --no-access-log`. Passes env vars (`CONFIG_PATH` pointing to generated config, `FALKORDB_DATA_DIR`, LLM API keys). Does NOT set `FALKORDB_URI` (absence triggers embedded FalkorDBLite).
4. Poll `GET /health` every 500ms, 120s timeout. Monitor every 60s after startup.
5. On healthy: `serverReady.resolve()` — unblocks graph calls in tools and hooks.
6. Stop: SIGTERM → 5s grace → SIGKILL.

Startup errors caught and logged — plugin degrades gracefully via `ReadyGate` (graph calls skipped with informative message until server is healthy). First start slow (~1-2 min for uv sync); subsequent starts fast.

### Communication Path

Plugin → `GraphitiClient` (HTTP with retry: 2 retries, 500ms/1000ms backoff for network errors and 5xx; 4xx throws immediately) → Graphiti REST API → FalkorDB. `search()` calls `POST /search` returning `{ facts }` — uses `graphiti.search()` which returns edges (facts) only. Graphiti also has a richer `search_()` API with configurable recipes (node search, combined search with cross-encoder reranking) but we don't use it yet.

**Rate-limit passthrough:** Server middleware (`rate_limit_middleware` in `main.py`) catches upstream `RateLimitError` from any LLM provider (openai, anthropic, etc.) — including errors wrapped in other exceptions — and returns HTTP 429 instead of 500. This prevents the `GraphitiClient` from retrying rate-limited requests (it only retries 5xx).

**Embedded mode (default):** No `FALKORDB_URI` → imports `AsyncFalkorDB` from `redislite` module → embedded DB at `{FALKORDB_DATA_DIR}/gralkor.db`.
**Legacy Docker mode:** `FALKORDB_URI` set → TCP to external FalkorDB.

### Native Memory Indexing (OpenClaw internals)

`createMemorySearchTool()` uses `MemoryIndexManager` (SQLite FTS5 + optional vector embeddings). Indexing is lazy (triggered by search, session start, or file watcher).

**Known OpenClaw bug:** In FTS-only mode (no embedding provider key), `syncMemoryFiles()` returns early (`if (!this.provider) return;`), so FTS tables are never populated → `memory_search` always returns empty. **Workaround:** configure an embedding provider (e.g. set `OPENAI_API_KEY`).

## Requirements

### Functional

| Requirement | Implementation |
|---|---|
| self-managing-backend | Plugin spawns Graphiti as managed Python subprocess with embedded FalkorDBLite; requires `uv` on PATH |
| persistent-memory | Episodes in FalkorDB via Graphiti; survive restarts |
| upgrade-safe-data | Default `dataDir` is `{pluginDir}/../.gralkor-data` (alongside, not inside plugin directory) so `openclaw plugins uninstall` doesn't destroy runtime data |
| auto-capture | `agent_end` buffers messages per session; flushed on `session_end` or idle timeout (whichever fires first) |
| idle-timeout-flush | Configurable idle timer (`idleTimeoutMs`, default 5 min) after last `agent_end` races `session_end`; `unref()`'d so it doesn't block shutdown |
| auto-recall | `before_agent_start` searches graph facts + native Markdown in parallel, injects combined results. Double-fire deduped (5s cache). |
| unified-search | `memory_search` combines native Markdown + graph facts in parallel |
| manual-store | `memory_add` creates episodes with `source=text`; Graphiti extracts structure |
| agent-partitioning | `group_id` from `agentId` isolates each agent's graph |
| cli-diagnostics | `gralkor status/search/clear` under `openclaw plugins`; group ID always required |
| test-mode | `test: true` in config logs full episode bodies (outbound) and search results (inbound) at plugin boundaries for debugging |
| temporal-awareness | Facts carry `created_at`, `valid_at`/`invalid_at`, `expired_at`; all 4 timestamps shown in tool results and auto-recall via `formatFact()` |
| native-delegation | `memory_search`/`memory_get` delegate to OpenClaw runtime via `api.runtime.tools` |
| error-propagation | Auto-capture flush retries transient errors (3 retries, exponential backoff); final error propagates to callers |

### Cross-functional

| Requirement | Implementation |
|---|---|
| graceful-degradation | Server startup errors caught/logged. `ReadyGate` (`src/config.ts`) tracks server health — created in `registerFullPlugin()`, resolved when service `start()` succeeds. Before ready: auto-recall/`memory_search` skip graph (still run native), `memory_add` returns informative message. After ready: normal operation. On graph failure post-ready: auto-recall logs warning and skips; tools throw so agent sees failure |
| docker-compat | `FALKORDB_URI` env var triggers legacy TCP mode |
| observability | `[gralkor]`-prefixed logs: concise single-line events with inline metrics (counts, sizes), skip reasons, errors. Startup always logs resolved config (providers, features, settings). No user content logged in normal mode. Test mode (`test: true`) additionally logs raw pluginConfig, full episode bodies, and search results. Uvicorn access logs disabled. |
| retry-backoff | Two retry layers: `GraphitiClient` retries network/5xx up to 2 times (500ms/1s); `flushSessionBuffer` retries transient errors up to 3 times (1s/2s/4s exponential). 4xx errors not retried at either layer. Final retry exhaustion logged with `console.error` before propagating. |
| rate-limit-passthrough | Server middleware returns 429 for upstream `RateLimitError` (any provider); prevents client retry amplification |
| untrusted-context | Auto-recalled facts wrapped in `<gralkor-memory trust="untrusted">` XML |
| health-monitoring | 60s health ping interval on child process |
| message-filtering | Auto-capture skips empty conversations (no text extracted) |
| capture-hygiene | `cleanUserMessageText()` strips system noise from user messages before storing: session-start instructions (dropped entirely), metadata wrappers (single or multiple `(untrusted metadata)` JSON blocks), `<gralkor-memory>` XML (feedback loop prevention) |
| prompt-robustness | Sequential stripping of system/session/metadata lines; fallback to `event.messages` |
| query-sanitization | Server-side `_sanitize_query()` strips backticks (RediSearch syntax prevention) |
| bundled-arm64-wheel | `make pack` builds falkordblite wheel for linux/arm64 via Docker; server manager force-installs after `uv sync` |
| configurable-providers | `llm`/`embedder` settings in plugin config; all provider SDKs bundled; dynamic `config.yaml` written to `dataDir` at startup. Defaults (`DEFAULT_LLM_*`/`DEFAULT_EMBEDDER_*` in `src/config.ts`) shared between config logging and server manager |

## Repo Map

```
├── CLAUDE.md
├── README.md                        # project readme
├── Makefile                          # build/test/deploy commands
├── package.json                      # root package
├── tsconfig.json
├── vitest.config.ts                  # vitest config (tree reporter)
├── config.yaml                       # LLM/embedder provider config
├── docker-compose.yml                # legacy Docker mode
├── .env.example
├── openclaw.plugin.json              # active memory-mode manifest
│
├── src/
│   ├── index.ts                      # entry point (kind: "memory")
│   ├── register.ts                   # shared registration (tools, hooks, service, CLI)
│   ├── tools.ts                      # tool factories + formatters
│   ├── hooks.ts                      # hook factories: auto-recall, auto-capture
│   ├── client.ts                     # GraphitiClient — HTTP wrapper with retry
│   ├── server-manager.ts             # Python process lifecycle
│   ├── types.ts                      # PluginApiBase, MemoryPluginApi interfaces
│   ├── config.ts                     # constants, config types, resolveConfig(), resolveGroupId()
│   └── *.test.ts                     # co-located tests (vitest)
│
├── resources/memory/
│   ├── package.json                  # @susu-eng/gralkor npm package config
│   └── openclaw.plugin.json          # canonical manifest
│
├── scripts/pack.sh                   # builds deployment tarball (arm64 wheel via Docker)
│
├── server/                           # Graphiti REST API (Python/FastAPI)
│   ├── main.py                       # FastAPI app (embedded FalkorDBLite or TCP)
│   ├── pyproject.toml / uv.lock      # uv project config + lockfile
│   ├── Dockerfile
│   ├── wheels/                       # (transient) bundled falkordblite arm64 wheel
│   └── tests/                        # pytest: health, episodes, search, graph_ops, lifespan, integration
│
└── dist/                             # compiled JS (git-ignored)
```

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `autoCapture.enabled` | boolean | `true` | Store conversations automatically |
| `autoCapture.maxThinkingChars` | number | `2000` | Max chars per thinking block before truncation |
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `10` | Max facts injected as context |
| `idleTimeoutMs` | number | `300000` | Idle flush timeout (ms) after last `agent_end`; races `session_end` |
| `llm.provider` | string | `"gemini"` | LLM provider (gemini, openai, anthropic, groq) |
| `llm.model` | string | `"gemini-3-flash-preview"` | LLM model name |
| `embedder.provider` | string | `"gemini"` | Embedding provider (gemini, openai) |
| `embedder.model` | string | `"gemini-embedding-2-preview"` | Embedding model name |
| `dataDir` | string | `{pluginDir}/../.gralkor-data` | Backend data directory (venv, FalkorDB files); lives alongside the plugin directory so uninstall/reinstall doesn't destroy it |
| `test` | boolean | `false` | Test mode — logs full episode bodies before sending to Graphiti and full search results before returning to agent |

## Environment Variables

- `GOOGLE_API_KEY` — Default provider. Gemini (fully self-contained: LLM + embeddings + reranking).
- `OPENAI_API_KEY` — OpenAI LLM + embeddings. Also needed for embeddings if using Anthropic or Groq.
- `ANTHROPIC_API_KEY` — Anthropic LLM (still needs `OPENAI_API_KEY` for embeddings).
- `GROQ_API_KEY` — Groq LLM (still needs `OPENAI_API_KEY` for embeddings).
- `FALKORDB_URI` — (Optional) `redis://host:port` for legacy Docker mode.

Provider configurable via plugin settings (`llm.provider`, `embedder.provider`) — a dynamic `config.yaml` is generated in `dataDir` at startup with Gemini defaults. Server manager forwards all API keys to the Python subprocess.

## Dev Workflow

```bash
openclaw plugins install -l .         # install locally for dev
make typecheck                        # type-check TypeScript
make test                             # all tests (plugin + server)
make test-plugin                      # vitest only
make test-server                      # pytest only (no Docker needed)
make setup-server                     # first time: sync server venv with uv
```

TDD: write failing tests first, then implement. Test output uses tree reporters (vitest `tree`, pytest `--spec` via pytest-spec).

### Test Commands

| Command | Scope | Reporter |
|---|---|---|
| `make test` | All tests (plugin + server) | tree |
| `make test-plugin` | TypeScript (vitest) | tree |
| `make test-server` | Python (pytest) | spec (tree-style) |
| `make test-server-changed` | Changed Python test files only | spec |
| `pnpm exec vitest run --changed` | Changed TypeScript tests only | tree |

## Building & Deploying

```bash
make version-patch                    # bump, commit, tag (also version-minor/major)
make publish                          # build + pnpm publish --access public
make pack                             # deployment tarball (requires Docker for arm64 wheel)
```

**Default deployment:** Install plugin, set LLM API key, restart OpenClaw. Requires `uv` on host.

**Docker HOME split:** Gateway uses `HOME=/data`, interactive shell uses `HOME=/root`. Fix: `ln -sfn /data/.openclaw /root/.openclaw`.

## Conventions

- TypeScript, ES modules (`"type": "module"`), target ES2022, bundler module resolution
- Imports use `.js` extensions (required for ESM with TypeScript)
- All Graphiti communication via HTTP through `src/client.ts` — no direct FalkorDB access

## Gotchas

- `register()` must be synchronous — async register silently registers nothing
- Native tool `execute()` returns `{ content: [{ type: "text", text: "..." }] }` (content-block format), not a string. Use `unwrapToolResult()` in `src/index.ts`.
- `falkordblite` installs as Python module `redislite`, not `falkordblite`
- `falkordblite` 0.9.0 sdist bundles x86-64 binary; on aarch64 with glibc < 2.39 this causes `RedisLiteServerStartError` + `AttributeError` cleanup artifact. Workaround: bundled arm64 wheel via `make pack`.
- Graphiti requires an LLM API key — server starts without one but all operations fail
- `AbortError` observed in auto-capture despite no `AbortSignal` — from Node HTTP layer (connection reset, process SIGTERM), not gateway
- Native `memory_search` returns empty without embedding provider configured (upstream OpenClaw bug — see Native Memory Indexing)

## Server Tests

Tests in `server/tests/` need no Docker or API keys. Unit tests use `httpx.AsyncClient` with `ASGITransport` (no lifespan, mocked Graphiti via `conftest.py`). Integration tests (`test_integration.py`) use real FalkorDBLite with zero mocks.

```bash
make setup-server && make test-server
```
