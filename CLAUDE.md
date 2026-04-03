# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

## What is this?

Memory plugin (`kind: "memory"`) replacing native `memory-core` with persistent, temporally-aware knowledge graphs (Graphiti + FalkorDB). Auto-recall searches graph+native Markdown before each turn; auto-capture buffers and flushes one episode per session.

| | |
|---|---|
| Entry point | `src/index.ts` → `dist/index.js` |
| Plugin ID / Kind | `gralkor` / `"memory"` |
| Tools | `memory_search` (unified), `memory_get` (native), `memory_add` (graph), `memory_build_indices` (maintenance), `memory_build_communities` (maintenance) |
| Hooks | `before_prompt_build` (auto-recall), `agent_end`/`session_end` (auto-capture) |
| CLI | `openclaw memory`, `openclaw gralkor` (plugin) |

## Mental Model

### Domain Objects

| Object | Type | Description |
|---|---|---|
| Episode | `Episode` | Captured conversation or manual store. `source`: `message` (auto-capture) or `text` (`memory_add`). |
| Fact (edge) | `Fact` | Extracted relationship. 4 timestamps: `created_at`, `valid_at`/`invalid_at`, `expired_at`. Via `formatFact()`. |
| Entity (node) | (Graphiti-internal) | Person/concept/thing with `summary`. Not exposed (we use edge-only `search()`). |
| Community | (Graphiti-internal) | Entity cluster. Not exposed. |
| Group | `string` | Partition key from `agentId` (fallback `"default"`). One graph per agent. |
| SessionBuffer | `SessionBuffer` | In-memory `messages` snapshot. `DebouncedFlush<SessionBuffer>`, keyed by `sessionKey \|\| agentId \|\| "default"`. |

### Plugin Registration

`register(api)` must be synchronous (async silently registers nothing). Config on `api.pluginConfig` (not second arg). `resolveConfig()` merges defaults; `validateOntologyConfig()` rejects reserved names. Graphiti URL: `http://127.0.0.1:8001`. `registerFullPlugin()` creates shared state (`get/setGroupId`, `get/setNativeSearch`, `serverReady` gate), registers tools/hooks/service/CLI. `ReadyGate` is module-level (survives 4+ reloads). `memory_search` combines native (SDK `getMemorySearchManager`) + graph (`client.search()`) in parallel. `memory_get` reads via SDK `readAgentMemoryFile`. `memory_build_indices` triggers index rebuild via `client.buildIndices()`. `memory_build_communities` triggers community detection via `client.buildCommunities(groupId)`.

### Plugin API Contract

- **`api.pluginConfig`** — `Record<string, unknown> | undefined` from `plugins.entries.<id>.config`
- **`registerTool(tool, opts?)`** — `execute(toolCallId, params, signal, onUpdate)`. Factory: `(ctx) => Tool | Tool[] | null` with `opts: { names }`.
- **Native memory SDK** — `openclaw/plugin-sdk/memory-core` exports `getMemorySearchManager` (returns `MemorySearchManager` with `.search()` and `.readFile()`). `openclaw/plugin-sdk/memory-core-host-runtime-files` exports `readAgentMemoryFile`. Loaded lazily at runtime via dynamic import (not available at build time). These replace the removed `api.runtime.tools` surface.
- **`api.on(event, handler)`** — Prefer over `registerHook` (crashes without `metadata: { name }`)
- **`registerService({ id, start, stop })`** — `id` not `name`
- **`registerCli(registrar, opts?)`** — Mounts under `openclaw` (top-level)
- Other: `api.runtime.{media, config, system, tts, channel, logging, state}`. No LLM inference.

### Hook Behavior

Handlers receive `(event, ctx)`. Agent ctx: `{ agentId?, sessionKey?, sessionId?, workspaceDir?, messageProvider? }`. Session ctx: `{ agentId?, sessionId, sessionKey? }`.

**Hooks used by gralkor:**

| Hook | `event` shape | Execution | Notes |
|---|---|---|---|
| `before_prompt_build` | `{ prompt, messages? }` | Sequential | Auto-recall: inject context before prompt |
| `agent_end` | `{ messages, success, error, durationMs }` | Fire-and-forget | Fires per agent run (not per session). Gateway doesn't await. |
| `session_end` | `{ sessionId, sessionKey?, messageCount, durationMs? }` | Fire-and-forget | **No messages payload** — metadata only. Fires when previous session replaced. |

**Other hooks:** `before_model_resolve`, `before_agent_start` (legacy, fires twice), `llm_input`/`llm_output`, `before_compaction`/`after_compaction`, `before_reset` (has `messages`), `message_received`/`message_sending`/`message_sent`, `before_tool_call`/`after_tool_call`, `tool_result_persist`/`before_message_write` (synchronous — no Promise), `session_start`, `subagent_*`, `gateway_*`.

**Message format:** `event.messages[].content` is `{ type, text?, ... }[]`. Types: `"text"`, `"output_text"`, `"thinking"`, `"toolCall"`, `"toolUse"`, `"functionCall"`. Roles: `"user"`, `"assistant"`, `"toolResult"`, `"tool"` (Ollama), `"compactionSummary"`.

### Data Lifecycle

**Auto-recall** (`before_prompt_build`):
Extracts user message from `event.prompt` (strips `System:` lines, session-start, metadata wrappers; falls back to `event.messages` stripping `<gralkor-memory>`). Captures `ctx.agentId` into group ID. Skips if disabled/no message. Fail-fast if not ready. Searches `client.search()` + native in parallel. Returns facts + two instructions (interpret relevance; search up to 3x parallel) in `<gralkor-memory trust="untrusted">` as `{ prependContext }`. Errors propagate.

**Auto-capture** (session buffering):
`agent_end` fires per run with full session `messages`. Debounces via `DebouncedFlush<SessionBuffer>` keyed by `sessionKey || agentId || "default"`. `session_end` force-flushes (race-safe). `extractMessagesFromCtx()` cleans user messages via `cleanUserMessageText()`, extracts assistant `text`/`thinking`/tool calls (as `tool_use`), converts `toolResult`/`tool` → `tool_result` (truncated 1000 chars). Media dropped. POSTs to `/ingest-messages`.

**Server-side:** `_format_transcript()` groups thinking/`tool_use`/`tool_result` per turn, distils into first-person behaviour summary via LLM, injects `(behaviour: ...)` before text. Failures dropped. Result → `graphiti.add_episode()`.

Flush retries 3x exponential (1s/2s/4s). 4xx not retried. SIGTERM → `flushAll()` (once via module guard; errors don't block shutdown).

### Graph Partitioning

Tools don't receive ctx (`execute(toolCallId, params)`). `before_prompt_build` captures `ctx.agentId` via `setGroupId`; tools read via `getGroupId`. Resolution: `agentId ?? "default"`.

graphiti-core maps each `group_id` to a separate FalkorDB named graph. `add_episode()` clones the driver per group, but `search()` doesn't route (uses current graph — `'default_db'` on fresh boot → empty). Fix: `_ensure_driver_graph()` in `main.py`.

### Server Manager Lifecycle

Service `gralkor-server` (`src/server-manager.ts`): `uv sync --no-dev --frozen` (venv in `dataDir`), force-install bundled wheels, write `config.yaml`, pass API keys as env vars (built synchronously from `config.*ApiKey` strings by `buildSecretEnv()` in `register.ts`), spawn uvicorn on `127.0.0.1:8001` with `CONFIG_PATH`/`FALKORDB_DATA_DIR`/resolved API keys. No `FALKORDB_URI` → embedded FalkorDBLite. Poll `/health` 500ms (120s timeout), monitor 60s. On healthy: `serverReady.resolve()` (module-level). SIGTERM → 5s → SIGKILL. First start ~1-2 min.

**Service self-start** (`src/register.ts`): `registerServerService()` registers the service with the host (for graceful `stop()` on SIGTERM) but does not wait for the host to call `start()`. Instead, it self-starts `manager.start()` as fire-and-forget immediately during registration. On success: `serverReady.resolve()`. On failure: error logged, `serverReady` stays unresolved. This bypasses a host bug where memory-kind plugins are excluded from the gateway startup scope (`resolveGatewayStartupPluginIds()` → `isGatewayStartupSidecar()` returns false). The manager is cached at module level (`serverManager` in `src/index.ts`); subsequent `register()` calls (host reloads the plugin 4+ times) reuse the cached manager instead of spawning a second server.

### Communication Path

Plugin → `GraphitiClient` (HTTP, 2 retries 500ms/1s for network/5xx; 4xx immediate) → REST API → FalkorDB. `search()` → `POST /search` returning `{ facts }` (edges only).

**Fact prioritization:** Over-fetches 2x, `_prioritize_facts()` reserves 70% slots for valid facts (`invalid_at` null), fills rest by relevance. `invalid_at` is the signal.

**Idempotency:** UUID per call as `idempotency_key`; server deduplicates (in-memory, process lifetime).

**Rate-limit passthrough:** Middleware: `RateLimitError` → 429 + `Retry-After` header (from upstream or default 5s). Client retries 429s indefinitely guided by `Retry-After`, independent of the 5xx/network retry budget. Cancellable via AbortSignal.

**Modes:** No `FALKORDB_URI` → embedded FalkorDBLite. `FALKORDB_URI` → legacy TCP.

### Native Memory Indexing (OpenClaw internals)

Native memory via `getMemorySearchManager` from `openclaw/plugin-sdk/memory-core` (lazy dynamic import). Uses SQLite FTS5 + optional vector embeddings. **Bug:** FTS-only mode (no embedding key) → `syncMemoryFiles()` returns early → empty. Workaround: configure embedding provider.

## Requirements

### Functional

| Requirement | Implementation |
|---|---|
| self-managing-backend | Managed Python subprocess with embedded FalkorDBLite; requires `uv` |
| lazy-index-build | `CALL db.indexes()` at boot; `build_indices_and_constraints()` only on fresh DBs |
| persistent-memory | Episodes in FalkorDB via Graphiti; survive restarts |
| upgrade-safe-data | `dataDir` at `{pluginDir}/../.gralkor-data` (outside plugin dir) |
| auto-capture | `agent_end` buffers per session; flushed on `session_end` or idle timeout |
| behaviour-distillation | `/ingest-messages` groups+distils behaviour blocks per turn via LLM |
| idle-timeout-flush | `DebouncedFlush` with `idleTimeoutMs` (default 5 min); `unref()`'d timers |
| auto-recall | `before_prompt_build` searches graph+native in parallel, injects facts+instructions |
| unified-search | `memory_search` combines native Markdown memory + graph facts; `memory_get` reads native files. Delegates to OpenClaw memory SDK. See test tree below. |
| manual-store | `memory_add` creates episodes with `source=text` |
| agent-partitioning | `group_id` from `agentId` → separate FalkorDB named graph |
| graph-routing | `_ensure_driver_graph()` routes reads to correct named graph |
| cli-diagnostics | `status/search` under `openclaw gralkor`; group ID for search |
| test-mode | Normal: metadata only. Test (`test: true`): full data at both layers |
| temporal-awareness | 4 timestamps on facts via `formatFact()` |
| error-propagation | Flush retries 3x exponential; final failure logs error (message dropped) without crashing |
| custom-ontology | Entity/edge types in config → `_build_ontology()` Pydantic models. Validates reserved names, protected attrs, edgeMap refs. Attributes required (not Optional). Supports string, enum, typed object, enum-with-description. |
| fact-prioritization | `_prioritize_facts()`: 70% valid slots, 30% by relevance. Over-fetches 2x. |
| sigterm-flush | `flushAll()` on SIGTERM; once via module guard |
| rich-status | Server state, config, data dir, graph stats, venv. `/health` returns graph stats. |
| build-indices-tool | `memory_build_indices` agent tool triggers `POST /build-indices` via `client.buildIndices()` |
| build-communities-tool | `memory_build_communities` agent tool triggers `POST /build-communities` via `client.buildCommunities(groupId)` |
| secret-resolution | API key strings from plugin config mapped to env vars and passed to server manager synchronously |
| startup | Self-starts server fire-and-forget during registration; module-level manager survives host reloads |

#### Recall

```
auto-recall-interpretation
  when auto-recall returns results
    then prependContext includes an instruction to interpret facts for relevance to the task at hand
  when memory_search tool execute returns results
    then response includes the same interpretation instruction
auto-recall-further-querying
  when auto-recall returns results
    then prependContext includes an instruction to search memory up to 3 times in parallel with diverse queries
  when memory_search tool execute returns results
    then response contains facts and interpretation instruction
    and response does not contain further querying instruction
unified-search (memory_search tool)
  when searching
    then searches native memory and graph in parallel
    and combines results into a single response
    when both native and graph return results
      then response includes native results and graph facts
      and response includes interpretation instruction
    when only graph returns results (native unavailable)
      then response includes graph facts only
    when only native returns results (graph empty)
      then response includes native results only
    when neither returns results
      then response is "No memories found."
    native memory delegation
      when manager is available
        then calls manager.search with query and options
        and returns JSON with results array
      when manager is unavailable
        then returns null
      when native search throws
        then returns null (does not propagate error)
  when server is not ready
    then throws error
  memory_get tool
    when path is valid
      then reads file via native memory SDK
      and returns JSON result
    when read fails
      then returns JSON with error
extractUserMessageFromPrompt
  when prompt has leading "System: ..." lines
    then strips them and returns user message
  when prompt has multiple leading System: lines
    then strips all of them
  when prompt has session-start instruction followed by user message
    then strips session-start and returns user message
  when prompt is only a session-start instruction
    then returns empty string
  when prompt has metadata wrapper followed by user message
    then strips wrapper and returns user message
  when prompt is only metadata wrapper
    then falls back to last user message from event.messages
  when prompt is metadata wrapper + whitespace only
    then falls back to messages
  when fallback messages contain only non-text blocks
    then returns empty string
  when System: appears mid-string (not at start)
    then does NOT strip it
  when session-start text appears mid-string
    then does NOT strip it
```

#### Capture

```
createAgentEndHandler
  when autoCapture is disabled
    then skips buffering
  when event.messages is empty
    then skips buffering
  when autoCapture is enabled and messages present
    then buffers messages in debouncer keyed by sessionKey || agentId || "default"
capture-hygiene
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
behaviour-distillation
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
flushSessionBuffer
  when flush succeeds on first attempt
    then returns without retry
  when flush fails with retryable error
    then retries up to 3 times with exponential backoff (1s/2s/4s)
  when flush fails with 4xx client error
    then does not retry
  when all retries exhausted
    then logs error (message dropped) without crashing
  when messages are empty after filtering
    then skips flush (no API call)
DebouncedFlush
  set and flush
    when set then flush for same key
      then delivers value exactly once
    when set called twice for same key
      then replaces previous value
    when flush called for non-existing key
      then is a no-op
  idle timeout
    when idle timeout elapses after set
      then flushes the value
    when set called again before timeout
      then resets the timer (debounce)
  state queries
    when entries exist
      then has() returns true, pendingCount reflects count
    when no entries
      then has() returns false, pendingCount is 0
  dispose
    when dispose called with pending entries
      then cancels all timers and clears entries
  flushAll
    when multiple keys have pending entries
      then all entries are flushed and all timers cleared
    when no entries are pending
      then flushAll is a no-op
    when one flush fails and another succeeds
      then successful flush still completes (allSettled)
sigterm-flush
  DebouncedFlush.flushAll
    when multiple keys have pending entries
      then all entries are flushed
      and all timers are cleared
    when no entries are pending
      then flushAll is a no-op
    when one flush fails and another succeeds
      then the successful flush still completes (allSettled)
  SIGTERM handler
    when SIGTERM is received with pending buffers
      then flushAll is called
      and pending count is logged
    when SIGTERM is received with no pending buffers
      then flushAll is not called
    when register() is called multiple times
      then only one SIGTERM handler is installed
```

#### Tools

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
memory_build_indices tool
  when server is ready
    then calls client.buildIndices
    and returns success message
  when server is not ready
    then throws error
memory_build_communities tool
  when server is ready
    then calls client.buildCommunities with group ID
    and returns community and edge counts
  when server is not ready
    then throws error
```

#### Startup

```
startup
  then the server is started as fire-and-forget during registration
  then subsequent register() calls reuse the existing manager (no duplicate starts)
  when self-start succeeds
    then serverReady resolves
  when self-start fails
    then the error is logged
    and serverReady remains unresolved
secret-resolution
  when config contains a plaintext API key string
    then env var is set to that string (trimmed)
  when config value is empty or whitespace
    then env var is not set
  when config value is undefined or absent
    then env var is not set
  then env vars are built synchronously and passed to the server manager
  then process.env is not read for API keys
```

#### Configuration

```
validateOntologyConfig
  when ontology is undefined
    then does not throw
  when ontology is valid
    then does not throw
  when entity name is a reserved graph label
    then rejects Entity, Episodic, Community, Saga
  when entity attribute uses a protected EntityNode field name
    then rejects uuid, name, group_id, labels, created_at, summary, attributes, name_embedding
  when edge attribute uses a protected EntityEdge field name
    then rejects uuid, group_id, source_node_uuid, target_node_uuid, created_at, name, fact, fact_embedding, episodes, expired_at, valid_at, invalid_at, attributes
  when edgeMap key format is invalid
    then rejects (expected "EntityA,EntityB")
  when edgeMap references undeclared entity
    then rejects
  when edgeMap references undeclared edge
    then rejects
  when excludedEntityTypes contains a declared entity
    then rejects (contradictory)
config-defaults-single-source
  when configSchema is read from index.ts
    then defaults match defaultConfig in config.ts
  when plugin manifest (openclaw.plugin.json) is read
    then defaults match defaultConfig in config.ts
  when resources/memory/openclaw.plugin.json is read
    then defaults match defaultConfig in config.ts
test-mode-query-logging
  when auto-recall searches in test mode
    then the extracted user message (search query) is logged
  when memory_search tool executes in test mode
    then the query argument is logged
  when test mode is disabled
    then queries are not logged
```

#### Operations

```
/health endpoint
  when graphiti is initialized and FalkorDB is connected
    then returns status ok with graph connected true and node/edge counts
  when graphiti is initialized but query fails
    then returns status ok with graph connected false and error message
  when graphiti is not initialized
    then returns status ok with graph connected false
openclaw gralkor status
  when server is running and healthy
    then shows process state, config summary, data dir, graph stats, venv state
  when server is unreachable
    then shows process state, config summary, data dir, and unreachable error
rate-limit-retry
  server side
    when upstream LLM returns a rate-limit error
      then 429 response includes Retry-After header
  client side
    when server returns 429 with Retry-After header
      then client waits for the specified duration and retries
    when server returns 429 repeatedly
      then client keeps retrying (no cap)
    when request is aborted via AbortSignal during rate-limit wait
      then client stops retrying and throws
    when server returns 429 then succeeds on retry
      then the successful response is returned
    then 429 retries are independent of the 5xx/network retry budget
```

#### Distribution

```
distribution
  publish-version-integrity
    when publish succeeds
      then version is bumped in package.json, openclaw.plugin.json, and resources/memory/package.json
      and a git commit and tag are created and pushed for the new version
    when publish fails (build error or npm reject)
      then version files are rolled back to their pre-publish values
      and no git commit or tag is created
    when successive publishes fail
      then version does not increment multiple times
    when DRY_RUN is set
      then version is bumped and synced across manifests
      and build and publish are skipped
      and no git commit or tag is created
  install-sequencing-docs
    then README documents recommended install sequencing for operators
```

### Cross-functional

| Requirement | Implementation |
|---|---|
| fail-fast | `ReadyGate` (module-level `src/config.ts`): before ready → throw. Graph failures propagate. |
| docker-compat | `FALKORDB_URI` → legacy TCP mode |
| observability | Two-tier `[gralkor]` logging. Config logged once (`configLogged` flag). Normal: metadata. Test: full data. `[gralkor] boot:` markers: `register()` logs `boot: plugin loaded (v...)` on first call, `boot: register() failed:` on error; server-manager logs `boot: starting/ready`; health poll logs unique errors and attempt count; self-start logs success/failure. |
| retry-backoff | Client: 2 retries (500ms/1s) network/5xx. Flush: 3 retries (1s/2s/4s). 4xx not retried (except 429 — see rate-limit-passthrough). |
| rate-limit-passthrough | Middleware: `RateLimitError` → 429 + `Retry-After` header. Client retries 429s indefinitely (guided by `Retry-After`), independent of 5xx retry budget. |
| untrusted-context | Facts in `<gralkor-memory trust="untrusted">` XML |
| health-monitoring | 60s ping on child process |
| capture-hygiene | `SYSTEM_MESSAGE_PATTERNS` in `src/hooks.ts`. User: unwrap metadata → strip XML/footer → filter system lines. Assistant: per-block `isSystemMessage()`. `"tool"` = `"toolResult"`. |
| prompt-robustness | Sequential strip system/session/metadata; fallback to `event.messages` |
| query-sanitization | `_sanitize_query()` strips backticks (RediSearch) |
| bundled-arm64-wheel | `make pack` builds falkordblite for linux/arm64 via Docker |
| configurable-providers | `llm`/`embedder` in config; dynamic `config.yaml` at startup |
| episode-idempotency | UUID per call; server deduplicates (in-memory, process lifetime) |

## Repo Map

```
├── CLAUDE.md / Makefile / package.json / tsconfig.json / vitest.config.ts
├── openclaw.plugin.json              # active manifest
├── src/                              # index.ts (entry), register.ts, tools.ts, hooks.ts,
│                                     # client.ts, server-manager.ts,
│                                     # native-memory.ts, types.ts, config.ts, *.test.ts
├── resources/memory/                 # canonical manifest for make pack
├── scripts/pack.sh                   # deployment tarball
├── test/functional/
├── server/                           # Python/FastAPI: main.py, tests/, wheels/
└── dist/                             # compiled JS (git-ignored)
```

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `autoCapture.enabled` | boolean | `true` | Auto-store conversations |
| `autoRecall.enabled` | boolean | `true` | Auto-inject context |
| `autoRecall.maxResults` | number | `10` | Max facts injected |
| `idleTimeoutMs` | number | `300000` | Flush timeout (ms); races `session_end` |
| `llm.provider` | string | `"gemini"` | LLM provider (gemini, openai, anthropic, groq) |
| `llm.model` | string | `"gemini-3.1-flash-lite-preview"` | LLM model |
| `embedder.provider` | string | `"gemini"` | Embedding provider (gemini, openai) |
| `embedder.model` | string | `"gemini-embedding-2-preview"` | Embedding model |
| `dataDir` | string | `{pluginDir}/../.gralkor-data` | Outside plugin dir (upgrade-safe) |
| `ontology.entities` | `Record<string, OntologyTypeDef>` | — | Custom entity types |
| `ontology.edges` | `Record<string, OntologyTypeDef>` | — | Custom edge types |
| `ontology.edgeMap` | `Record<string, string[]>` | — | `"EntityA,EntityB"` → edges |
| `ontology.excludedEntityTypes` | `string[]` | — | Exclude from extraction |
| `test` | boolean | `false` | Verbose logging both layers |
| `googleApiKey` | secret | — | Google API key for Gemini |
| `openaiApiKey` | secret | — | OpenAI API key |
| `anthropicApiKey` | secret | — | Anthropic API key |
| `groqApiKey` | secret | — | Groq API key |

## Environment Variables

API keys are configured as strings in plugin config (`api.pluginConfig`). The OpenClaw gateway resolves SecretRef objects before they reach the plugin — we receive plain strings. `buildSecretEnv()` in `src/register.ts` maps config fields to env vars passed to the server manager.

- `FALKORDB_URI` — (Optional) legacy Docker mode

Server manager generates `config.yaml` and forwards all keys at startup.

## Dev Workflow

```bash
openclaw plugins install -l .         # install locally for dev
make typecheck                        # type-check TypeScript
make test                             # all tests (plugin + server)
make test-plugin                      # vitest only
make test-server                      # pytest only (no Docker needed)
make setup-server                     # first time: sync server venv
```

TDD: failing tests first. Tree reporters (vitest `tree`, pytest `--spec`).

### Test Commands

| Command | Scope | Reporter |
|---|---|---|
| `make test` | All (plugin + functional + server) | tree |
| `make test-plugin` | TS unit tests | tree |
| `make test-functional` | TS functional tests | tree |
| `make test-server` | Python | spec |
| `make test-server-changed` | Changed Python tests | spec |
| `pnpm exec vitest run --changed` | Changed TS tests | tree |
| `make test-mutate` | Mutation testing (Stryker) | clear-text |
| `cd server && uv run pytest tests/test_distillation_live.py -v -s` | Live distillation (real LLM) | stdout |

**Live distillation tests:** Run after changing `_DISTILL_SYSTEM_PROMPT` or default LLM. Uses `server/tests/fixtures/distillation_cases.json`. Writes results to `server/tests/distillation_results/` (gitignored) for review against the behaviour-distillation test tree. `-s` to eyeball.

## Building & Deploying

```bash
pnpm run publish:npm -- patch   # bump, build, publish, commit+tag (also minor/major)
make pack                       # deployment tarball (arm64 wheel via Docker)
```

Requires `uv`. Docker HOME split: `ln -sfn /data/.openclaw /root/.openclaw`.

## Conventions

- TypeScript, ESM, ES2022, bundler resolution. `.js` extensions required.
- All Graphiti communication via HTTP through `src/client.ts`

## Gotchas

- `register()` must be synchronous — async silently registers nothing
- Native memory SDK imports (`openclaw/plugin-sdk/memory-core` etc.) resolve at runtime via OpenClaw's jiti loader — not available at build time. Use template-literal dynamic imports to prevent TS from resolving them.
- `falkordblite` installs as Python module `redislite`, not `falkordblite`
- `falkordblite` 0.9.0 sdist x86-64 only; aarch64 → `RedisLiteServerStartError`. Fix: `make pack` (arm64 wheel).
- Graphiti requires LLM API key — starts without one but all operations fail
- `AbortError` in auto-capture — from Node HTTP layer (connection reset/SIGTERM), not gateway
- Native `memory_search` empty without embedding provider (upstream bug)
- **graphiti-core search doesn't route:** `add_episode()` clones driver per `group_id`, `search()` doesn't. Fix: `_ensure_driver_graph()`. `FalkorDriver.__init__()` fires index build on every clone (noisy but caught).
- **Plugin tools blocked by tool profiles:** `coding` profile allowlists core tools only. Plugin tools (`memory_add`, `memory_build_indices`, `memory_build_communities`) are filtered out. Workaround: `"alsoAllow": ["memory_add", "memory_build_indices", "memory_build_communities"]` or `"alsoAllow": ["gralkor"]` in `tools` config.

## Server Tests

No Docker or API keys. Unit: `httpx.AsyncClient` + `ASGITransport` (mocked Graphiti). Integration: real FalkorDBLite. Run: `make setup-server && make test-server`.
