# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

## What is this?

An OpenClaw plugin that gives AI agents persistent, temporally-aware memory via knowledge graphs. Uses Graphiti (knowledge graph framework by Zep) backed by FalkorDB (in-memory graph database).

A memory plugin (`kind: "memory"`) replacing native `memory-core` with three tools: `memory_search` (unified native Markdown + Graphiti graph), `memory_get` (native Markdown only), `memory_add` (knowledge graph). Auto-recall searches both backends before each turn; auto-capture buffers session messages and flushes a single episode per session at session boundaries.

| | |
|---|---|
| Entry point | `src/index.ts` → `dist/index.js` |
| Plugin ID / Kind | `gralkor` / `"memory"` |
| Tools | `memory_search` (unified), `memory_get` (native), `memory_add` (graph) |
| Hooks | `before_prompt_build` (auto-recall), `agent_end`/`session_end` (auto-capture) |
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
| SessionBuffer | `SessionBuffer` | In-memory buffer holding latest `messages` snapshot for a session. Managed by `DebouncedFlush<SessionBuffer>`, keyed by `sessionKey \|\| agentId \|\| "default"`. Flushed as episode on idle timeout or session boundary (whichever first). |

### Plugin Registration

`register(api)` is synchronous (async register silently registers nothing — gateway discards the return value). OpenClaw calls `register(api)` with a **single argument** — the plugin API object. Plugin-specific config from `plugins.entries.<id>.config` is on **`api.pluginConfig`** (not a second argument). Sequence:

1. Read `api.pluginConfig`, pass to `resolveConfig()` which merges with defaults, passing through `llm`/`embedder`/`ontology` fields. `validateOntologyConfig()` rejects reserved names (`Entity`, `Episodic`, `Community`, `Saga`) and protected attribute names. Graphiti URL is hardcoded: `http://127.0.0.1:8001`.
2. Create `GraphitiClient`, resolve `pluginDir` from `import.meta.url`.
3. `registerFullPlugin()` creates shared state (`getGroupId`/`setGroupId`, `getNativeSearch`/`setNativeSearch`, `serverReady` gate), then registers tools, hooks, server service, and CLI. The `ReadyGate` is module-level (not per-instance) so it survives the 4+ plugin reloads OpenClaw does per event.

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

**Hooks used by gralkor:** `before_prompt_build` (auto-recall), `agent_end` + `session_end` (auto-capture with session buffering).

`event.messages[].content` is an array of `{ type, text?, ... }` objects (not JSON string). Types: `"text"`, `"output_text"`, `"thinking"`, `"toolCall"`, `"toolUse"`, `"functionCall"`, etc. Message roles: `"user"`, `"assistant"`, `"toolResult"` (standard), `"tool"` (Ollama adapter), `"compactionSummary"` (OpenClaw internal). Auto-capture filters to user/assistant messages: keeps `text`/`output_text`/`thinking` blocks, serializes tool call blocks (`toolCall`/`toolUse`/`functionCall`) as `tool_use`, and converts `toolResult`/`tool` messages to `tool_result` blocks (truncated to 1000 chars). Structured messages are sent to the server for formatting and behaviour distillation.

### Data Lifecycle

**Auto-recall** (`before_prompt_build`):
1. Extract user message from `event.prompt`: strips `System:` lines, session-start lines (`"A new session was started..."`), metadata wrappers (`/^.+?\(untrusted metadata\):/`). Falls back to last user message from `event.messages` if prompt yields nothing. Strips `<gralkor-memory>` blocks from fallback.
2. Capture `ctx.agentId` into shared group ID state.
3. Skip if disabled or no user message.
4. **Server readiness check:** If `serverReady.isReady()` is false, auto-recall and tools throw an error (fail-fast). The `ReadyGate` is module-level so it persists across plugin reloads within the same process.
5. Search `client.search()` (facts only — uses `graphiti.search()` edge-based hybrid) and native `memory_search` in parallel.
6. Include facts in context plus two behavioral instructions: first encouraging interpretation of facts for relevance to the task at hand, then encouraging up to 3 parallel memory searches with diverse queries. Return in `<gralkor-memory source="auto-recall" trust="untrusted">` XML as `{ prependContext }`.
7. On graph or native failure: error propagates to caller (fail-fast).

**Auto-capture** (session buffering via `agent_end` → flush on `session_end`):
1. `agent_end` fires after every agent run (each user message → response cycle). `event.messages` is the **full session message array** (`activeSession.messages` in OpenClaw) — all turns accumulated in the session, not just the current turn. However, if context-window compaction has occurred, earlier messages may be replaced with compacted summaries.
2. `agent_end` handler debounces messages via `DebouncedFlush<SessionBuffer>` (in `src/hooks.ts`), keyed by `sessionKey || agentId || "default"`. Each `set()` replaces the previous value and resets the idle timer (classic debounce). Timers use `unref()` so they don't block Node shutdown.
3. `session_end` handler calls `debouncer.flush(key)` — cancels the idle timer and flushes immediately. Race safety: `DebouncedFlush` deletes the entry before calling `onFlush`, so whichever fires first (idle timeout or explicit flush) wins; the other no-ops.
5. `flushSessionBuffer()` calls `extractMessagesFromCtx()` which filters messages into structured `EpisodeMessage[]`. For user messages: joins `text`/`output_text` blocks, cleans system noise via `cleanUserMessageText()` (session-start instructions dropped, metadata wrappers stripped, `<gralkor-memory>` XML removed, `Untrusted context` footer block removed, `System:` event lines stripped). For assistant messages: keeps `text`/`output_text`, `thinking`, and tool call blocks (`toolCall`/`toolUse`/`functionCall` serialized as `tool_use` with name + input); system text blocks dropped via `isSystemMessage()`. `toolResult` and `tool` (Ollama) messages are converted to assistant messages with `tool_result` blocks (text truncated to 1000 chars). **Silently drops media** (images, video).
6. Skip if disabled or empty (no messages after filtering).
7. POST to `/ingest-messages` with structured `messages` array and `reference_time`. The server formats the transcript and distils behaviour (see below).
8. **Server-side transcript formatting + behaviour distillation:** `_format_transcript()` groups thinking, `tool_use`, and `tool_result` blocks per turn, distils each group into a single first-person behaviour summary via the configured LLM in parallel, then builds the transcript with `Assistant: (behaviour: {summary})` lines injected before each turn's first assistant text. If distillation fails for a turn, the behaviour line is silently dropped. The resulting text is passed to `graphiti.add_episode()`.
9. `flushSessionBuffer` is retried up to 3 times with exponential backoff (1s/2s/4s) for transient errors (network, 5xx, `AbortError`). 4xx client errors are not retried. After exhaustion, the last error propagates to callers.

**Unrecoverable edge case:** If the process terminates before either `session_end` or the idle timer fires, buffered messages are lost. Idle timers use `unref()` so they don't block Node shutdown.

### Graph Partitioning

Tools don't receive agent context (OpenClaw calls `execute(toolCallId, params)` — no ctx). The `before_prompt_build` hook captures `ctx.agentId` via `setGroupId`, tools read via `getGroupId`. `resolveGroupId(ctx)` in `src/config.ts` handles this for hooks/CLI.

**FalkorDB named graphs:** graphiti-core's FalkorDB driver maps each `group_id` to a separate FalkorDB named graph. `FalkorDriver(database='default_db')` is the default; `add_episode(group_id='main')` clones the driver via `self.driver.clone(database='main')` and mutates `self.clients.driver` (graphiti.py:887-889). This means `execute_query` calls `self.client.select_graph('main')` — a physically separate graph from `'default_db'`. However, `graphiti.search()` does **not** perform this routing — it uses whatever graph the driver currently targets. On fresh boot the driver targets `'default_db'` (empty), so searches return 0 results until the first `add_episode` switches it. The server's `_ensure_driver_graph()` in `main.py` applies the same routing for read paths.

### Server Manager Lifecycle

Managed via `src/server-manager.ts`, registered as service `gralkor-server`:

1. `uv sync --no-dev --frozen --directory {serverDir}` with `UV_PROJECT_ENVIRONMENT={dataDir}/venv`
2. Force-install bundled wheels from `server/wheels/` (if any) via `uv pip install --reinstall --no-deps` — bypasses lockfile hash verification. Incompatible wheels caught gracefully.
3. Write dynamic `config.yaml` to `dataDir` from plugin settings (`llm`/`embedder` with defaults, `ontology` if configured, `test` flag if enabled). If ontology is present, server builds Pydantic models at startup via `_build_ontology()` and passes them to every `graphiti.add_episode()` call. Server reads `test` from config to set logger level (DEBUG for test, INFO for normal). Spawn `{venvPython} -m uvicorn main:app --host 127.0.0.1 --port 8001 --no-access-log`. Passes env vars (`CONFIG_PATH` pointing to generated config, `FALKORDB_DATA_DIR`, LLM API keys). Does NOT set `FALKORDB_URI` (absence triggers embedded FalkorDBLite).
4. Poll `GET /health` every 500ms, 120s timeout. Monitor every 60s after startup.
5. On healthy: `serverReady.resolve()` — module-level flag, persists across plugin reloads.
6. Stop: SIGTERM → 5s grace → SIGKILL.

Startup errors propagate (fail-fast). `ReadyGate` is module-level — resolved once by the first service `start()`, persists across the 4+ plugin reloads OpenClaw does per event. First start slow (~1-2 min for uv sync); subsequent starts fast.

### Communication Path

Plugin → `GraphitiClient` (HTTP with retry: 2 retries, 500ms/1000ms backoff for network errors and 5xx; 4xx throws immediately) → Graphiti REST API → FalkorDB. `search()` calls `POST /search` returning `{ facts }` — uses `graphiti.search()` which returns edges (facts) only. Graphiti also has a richer `search_()` API with configurable recipes (node search, combined search with cross-encoder reranking) but we don't use it yet.

**Fact prioritization:** `/search` over-fetches 2x `num_results` from Graphiti, then `_prioritize_facts()` applies a reserved-slot system: 70% of slots reserved for valid facts (`invalid_at` is null), remaining 30% filled by Graphiti's relevance ranking regardless of validity. This prevents invalid/expired facts from crowding out valid ones while still allowing highly relevant non-valid facts to appear. `invalid_at` is the signal — a fact with `invalid_at` set is no longer true; a fact with `expired_at` set has been superseded (part of an active trail) but still has `invalid_at` set, so both are treated as non-valid.

**Idempotency:** `addEpisode()` and `ingestMessages()` generate a `crypto.randomUUID()` per call (before the retry loop) and include it as `idempotency_key` in the request body. The server requires the field and maintains an in-memory store (`_idempotency_store` in `main.py`) mapping keys to serialized episode results with a 5-minute TTL. If a retry arrives with a key that's already been processed, the server returns the cached result without calling `graphiti.add_episode()`. Lazy cleanup prunes expired entries when the store exceeds 100 items.

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
| lazy-index-build | Server checks `CALL db.indexes()` at boot; only runs `build_indices_and_constraints()` on fresh databases with no existing indices. Subsequent boots skip the 13 sequential CREATE INDEX queries. |
| persistent-memory | Episodes in FalkorDB via Graphiti; survive restarts |
| upgrade-safe-data | Default `dataDir` is `{pluginDir}/../.gralkor-data` (alongside, not inside plugin directory) so `openclaw plugins uninstall` doesn't destroy runtime data |
| auto-capture | `agent_end` buffers messages per session; flushed on `session_end` or idle timeout (whichever fires first) |
| behaviour-distillation | Server-side: `POST /ingest-messages` receives structured messages, groups thinking, `tool_use`, and `tool_result` blocks per turn, distils each into a first-person `(behaviour: ...)` summary via LLM, formats transcript, and creates episode. Failures silently dropped. |
| idle-timeout-flush | `DebouncedFlush<SessionBuffer>` with configurable `idleTimeoutMs` (default 5 min); `agent_end` calls `set()` (debounce), `session_end` calls `flush()` (force); `unref()`'d timers don't block shutdown |
| auto-recall | `before_prompt_build` searches graph facts + native Markdown in parallel, injects combined results plus behavioral instructions: (1) interpret facts for relevance to the task at hand, (2) search memory up to 3 times in parallel with diverse queries. Fires once per turn. |
| unified-search | `memory_search` combines native Markdown + graph facts in parallel. Native results with empty `results: []` metadata JSON are filtered out (`hasNativeResults()` in `src/hooks.ts`). Same filter used by auto-recall. |
| manual-store | `memory_add` creates episodes with `source=text`; Graphiti extracts structure |
| agent-partitioning | `group_id` from `agentId` isolates each agent's graph. graphiti-core's FalkorDB driver maps each group_id to a separate named graph (see Graph Partitioning). |
| graph-routing | Server-side `_ensure_driver_graph()` in `main.py` routes the graphiti driver to the correct FalkorDB named graph before read operations. Required because graphiti-core's `add_episode()` clones the driver per group_id but `search()` does not — without this fix, searches return empty on fresh boot until the first `add_episode` switches the driver. |
| cli-diagnostics | `gralkor status/search/clear` under `openclaw plugins`; group ID always required |
| test-mode | Two-tier logging. Normal mode: metadata only (counts, sizes, timings, type breakdowns) — no user content. Test mode (`test: true`): additionally logs full data at both layers. TS side uses `[gralkor] [test]` console.log for raw pluginConfig, episode messages, search results, auto-recall context. Python server uses `logger.debug` (level set from `test` in config.yaml): episode bodies, behaviour pre/post distillation, Graphiti results. |
| temporal-awareness | Facts carry `created_at`, `valid_at`/`invalid_at`, `expired_at`; all 4 timestamps shown in tool results and auto-recall via `formatFact()` |
| native-delegation | `memory_search`/`memory_get` delegate to OpenClaw runtime via `api.runtime.tools` |
| error-propagation | Auto-capture flush retries transient errors (3 retries, exponential backoff); final error propagates to callers |
| episode-idempotency | Client generates `crypto.randomUUID()` per `addEpisode`/`ingestMessages` call (before retry loop) as required `idempotency_key`. Server-side in-memory store with 5-min TTL deduplicates retries — returns cached result without calling `graphiti.add_episode()`. |
| custom-ontology | User-declared entity/edge types in plugin config (`ontology`). TypeScript validates config (reserved names, protected attrs, edgeMap cross-refs), serializes to `config.yaml`. Python server builds dynamic Pydantic models at startup via `_build_ontology()` and passes to every `graphiti.add_episode()`. Attributes are required (not Optional) to gate entity extraction. Supports string, enum (array → `Literal`), typed object, and enum-with-description forms. Reserved entity names: `Entity`, `Episodic`, `Community`, `Saga`. |
| fact-prioritization | Server-side `_prioritize_facts()` in `/search` reserves slots for valid facts, fills remainder by relevance. Over-fetches 2x from Graphiti to widen candidate pool. See test tree below. |

#### auto-recall-interpretation

```
auto-recall-interpretation
  when auto-recall returns results
    then prependContext includes an instruction to interpret facts for relevance to the task at hand
```

#### auto-recall-further-querying

```
auto-recall-further-querying
  when auto-recall returns results
    then prependContext includes an instruction to search memory up to 3 times in parallel with diverse queries
  when memory_search tool returns results
    then no further querying instruction is included in the response
```

#### fact-prioritization

```
_prioritize_facts
  when all facts are valid (no invalid_at)
    then all facts returned up to limit
    and original relevance order preserved
  when mix of valid and invalid facts
    then reserved slots (70% of limit) filled with valid facts first
    and remaining slots filled by original relevance order (valid or invalid)
    and total never exceeds limit
  when fewer valid facts than reserved slots
    then all valid facts placed in reserved slots
    and remaining slots filled with non-valid facts by relevance
  when all facts are invalid
    then invalid facts returned up to limit (no empty results)
  when invalid_at is set but expired_at is also set (superseded)
    then treated same as any invalid fact (invalid_at is the signal)
  when more candidates than limit (over-fetch scenario)
    then valid facts from beyond original limit can displace invalid facts

/search endpoint
  when searching
    then over-fetches 2x num_results from Graphiti
    and applies _prioritize_facts before returning
    and logs valid/non-valid breakdown
```

#### capture-hygiene

```
extractMessagesFromCtx
  message roles
    when role is "user"
      then text/output_text blocks extracted and cleaned via cleanUserMessageText
    when role is "assistant"
      then text blocks checked individually via isSystemMessage, system blocks dropped
      and thinking blocks extracted (type "thinking")
      and tool call blocks (toolCall/toolUse/functionCall) serialized as tool_use
    when role is "toolResult"
      then converted to assistant message with tool_result block
      and text truncated to 1000 chars
    when role is "tool" (Ollama adapter)
      then treated same as "toolResult"
    when role is "compactionSummary" or unknown
      then silently dropped

cleanUserMessageText
  when message contains (untrusted metadata) JSON block
    then block stripped, surrounding user content preserved
  when message contains <gralkor-memory> XML
    then XML removed (feedback loop prevention)
  when message contains Untrusted context (metadata...) footer block
    then entire footer block stripped (header + JSON body)
  when message contains system lines mixed with user content
    then system lines stripped per-line via isSystemLine
    and real user content preserved
  when message is entirely system content
    then returns empty string (message dropped)

SYSTEM_MESSAGE_PATTERNS (isSystemLine / isSystemMessage)
  then matches "A new session was started..."
  then matches "Current time:..." (case insensitive)
  then matches "✅ New session started..." (with or without emoji)
  then matches "System: [timestamp] ..." event lines
  then matches "[User sent media without caption]"
```

#### behaviour-distillation

```
_format_transcript (server-side)
  when assistant message has thinking blocks
    then grouped into behaviour for that turn
  when assistant message has tool_use blocks
    then grouped into behaviour for that turn
  when assistant message has tool_result blocks
    then grouped into behaviour for that turn
  when turn has behaviour blocks and llm_client available
    then blocks joined with --- separator
    and distilled via LLM into first-person past-tense summary
    and injected as "Assistant: (behaviour: {summary})" before assistant text
  when behaviour blocks contain memory_search results (recalled facts)
    then distillation describes the intent (e.g. "consulted memory")
    and does NOT restate the recalled fact content
  when behaviour blocks contain thinking that references recalled data
    then distillation captures the reasoning and decisions
    and does NOT echo the specific data that was recalled
  when distillation fails for a turn
    then behaviour line silently dropped, assistant text preserved
  when turn has only text blocks (no behaviour)
    then text rendered as "Assistant: {text}" with no behaviour line
  user messages
    then rendered as "User: {text}"
```

### Cross-functional

| Requirement | Implementation |
|---|---|
| fail-fast | Server startup errors propagate (no graceful degradation). `ReadyGate` (`src/config.ts`) is module-level — resolved once by service `start()`, persists across plugin reloads. Before ready: auto-recall and tools throw errors. After ready: normal operation. On graph failure: errors propagate to callers (auto-recall throws, tools throw, session flush throws). |
| docker-compat | `FALKORDB_URI` env var triggers legacy TCP mode |
| observability | Two-tier `[gralkor]`-prefixed logging across TS plugin and Python server. **Config log once:** `register()` is called 4+ times per event by OpenClaw; config lines only emit on first call (module-level `configLogged` flag in `src/index.ts`). **Normal mode:** concise single-line events with inline metrics (counts, sizes, durations, type breakdowns), skip reasons, errors. Buffer addition logs role/block breakdown; flush logs filtered message breakdown + API call duration; server logs episode body size/lines, thinking distillation group counts/success rate, `add_episode` duration + UUID, search request metadata (query length, group_ids, result count, duration, errors). Boot sequence uses structured `[gralkor] boot:` markers with total elapsed time. Index build duration logged at startup. No user content in normal mode. **Test mode:** TS additionally logs raw pluginConfig (first load only), full episode messages, search results, auto-recall context via `[gralkor] [test]`. Python server sets logger to DEBUG (from `test` in config.yaml), logging full episode bodies, thinking text pre/post distillation, Graphiti results, search result facts. Uvicorn access logs disabled. |
| retry-backoff | Two retry layers: `GraphitiClient` retries network/5xx up to 2 times (500ms/1s); `flushSessionBuffer` retries transient errors up to 3 times (1s/2s/4s exponential). 4xx errors not retried at either layer. Final retry exhaustion logged with `console.error` before propagating. |
| rate-limit-passthrough | Server middleware returns 429 for upstream `RateLimitError` (any provider); prevents client retry amplification |
| untrusted-context | Auto-recalled facts wrapped in `<gralkor-memory trust="untrusted">` XML |
| health-monitoring | 60s health ping interval on child process |
| message-filtering | Auto-capture skips empty conversations (no text extracted) |
| capture-hygiene | System messages detected and stripped via `SYSTEM_MESSAGE_PATTERNS` in `src/hooks.ts`. For user messages: metadata wrappers (`(untrusted metadata)` JSON blocks) are unwrapped first, `<gralkor-memory>` XML removed, `Untrusted context (metadata...)` footer block removed, then system lines filtered per-line via `isSystemLine()` — preserves real user content when mixed with system lines (e.g. `Current time:` followed by actual question). For assistant messages: each text block checked individually via `isSystemMessage()`. Catches session-start instructions, `Current time:` metadata, `✅ New session started` notifications, `System:` event lines, `[User sent media without caption]`. `role: "tool"` messages handled same as `"toolResult"`. New runtime-injected patterns go in `SYSTEM_MESSAGE_PATTERNS`. See test tree below. |
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
│   ├── config.ts                     # constants, config types, resolveConfig(), resolveGroupId(), validateOntologyConfig(), ReadyGate (module-level)
│   └── *.test.ts                     # co-located unit tests (vitest)
│
├── resources/memory/
│   ├── package.json                  # @susu-eng/gralkor npm package config
│   └── openclaw.plugin.json          # canonical manifest
│
├── scripts/pack.sh                   # builds deployment tarball (arm64 wheel via Docker)
│
├── test/functional/                  # functional tests (multi-load resilience, etc.)
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
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `10` | Max facts injected as context |
| `idleTimeoutMs` | number | `300000` | Idle flush timeout (ms) after last `agent_end`; races `session_end` |
| `llm.provider` | string | `"gemini"` | LLM provider (gemini, openai, anthropic, groq) |
| `llm.model` | string | `"gemini-3-flash-preview"` | LLM model name |
| `embedder.provider` | string | `"gemini"` | Embedding provider (gemini, openai) |
| `embedder.model` | string | `"gemini-embedding-2-preview"` | Embedding model name |
| `dataDir` | string | `{pluginDir}/../.gralkor-data` | Backend data directory (venv, FalkorDB files); lives alongside the plugin directory so uninstall/reinstall doesn't destroy it |
| `ontology.entities` | `Record<string, OntologyTypeDef>` | — | Custom entity types with description and attributes |
| `ontology.edges` | `Record<string, OntologyTypeDef>` | — | Custom edge types with description and attributes |
| `ontology.edgeMap` | `Record<string, string[]>` | — | Maps `"EntityA,EntityB"` → allowed edge types |
| `ontology.excludedEntityTypes` | `string[]` | — | Entity types to exclude from extraction |
| `test` | boolean | `false` | Test mode — TS logs full episode messages, search results, auto-recall context; Python server logs at DEBUG (episode bodies, behaviour pre/post distillation, Graphiti results). Passed to server via config.yaml. |

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
| `make test` | All tests (plugin + functional + server) | tree |
| `make test-plugin` | TypeScript unit tests (vitest) | tree |
| `make test-functional` | TypeScript functional tests (`test/functional/`) | tree |
| `make test-server` | Python (pytest) | spec (tree-style) |
| `make test-server-changed` | Changed Python test files only | spec |
| `pnpm exec vitest run --changed` | Changed TypeScript tests only | tree |
| `make test-mutate` | Mutation testing (TypeScript, Stryker) | clear-text |
| `cd server && uv run pytest tests/test_distillation_live.py -v -s` | Live distillation quality (real LLM) | stdout |

**Live distillation tests:** Run after changing `_DISTILL_SYSTEM_PROMPT` in `server/main.py`. These call the configured LLM (same provider/model as production) against fixture cases in `server/tests/fixtures/distillation_cases.json` and check that distilled output doesn't echo recalled fact content. Use `-s` to see the actual LLM output for eyeballing. Cases have `reject_patterns` (strings from recalled facts that must NOT appear in output). Add new cases to the fixture file when new distillation failure modes are discovered.

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
- **graphiti-core search doesn't route to named graph:** `add_episode()` clones the FalkorDB driver to target a named graph matching `group_id`, but `search()` uses whatever graph the driver currently points at. On fresh boot this is `'default_db'` (empty). Fix: `_ensure_driver_graph()` in `server/main.py` applies the same routing before read operations. Also: `FalkorDriver.__init__()` fires `build_indices_and_constraints()` as a fire-and-forget background task on every instantiation (including clones) — caught by "already indexed" error handler but noisy.
- **`memory_add` blocked by tool profiles:** OpenClaw's `coding` profile generates an allowlist of core tools only (`memory_search`, `memory_get` are core; `memory_add` is a plugin tool). The tool policy pipeline (`filterToolsByPolicy`) blocks any tool not in the allowlist — so `memory_add` silently disappears. Workaround: users must add `"alsoAllow": ["memory_add"]` (or `"gralkor"` or `"group:plugins"`) to their `tools` config. This is a two-layer issue: layer 1 (`resolvePluginTools`) passes non-optional plugin tools through; layer 2 (`applyToolPolicyPipeline`) filters all tools against the profile allowlist and kills `memory_add`.

## Server Tests

Tests in `server/tests/` need no Docker or API keys. Unit tests use `httpx.AsyncClient` with `ASGITransport` (no lifespan, mocked Graphiti via `conftest.py`). Integration tests (`test_integration.py`) use real FalkorDBLite with zero mocks.

```bash
make setup-server && make test-server
```
