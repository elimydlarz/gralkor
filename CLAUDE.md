# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

## What is this?

Memory plugin (`kind: "memory"`) providing persistent, temporally-aware knowledge graphs (Graphiti + FalkorDB). Auto-recall searches the graph before each turn; auto-capture buffers and flushes one episode per session.

| | |
|---|---|
| Entry point | `src/index.ts` → `dist/index.js` |
| Plugin ID / Kind | `gralkor` / `"memory"` |
| Tools | `memory_search` (graph: facts + entity summaries, with LLM interpretation in session-message context), `memory_add` (graph), `memory_build_indices` (maintenance), `memory_build_communities` (maintenance) |
| Hooks | `before_prompt_build` (auto-recall), `agent_end`/`session_end` (auto-capture) |
| CLI | `openclaw gralkor` (plugin) |

## Mental Model

### Domain Objects

- **Episode** (`Episode`) — `source: message` (auto-capture) or `text` (`memory_add`).
- **Fact / edge** (`Fact`) — 4 timestamps via `formatFact()`: `created_at`, `valid_at`/`invalid_at`, `expired_at`.
- **Entity / node** (`EntityNode`) — has `summary`. Returned by `memory_search` slow mode only.
- **Group** — partition key derived from `agentId`; one FalkorDB named graph per group.
- **SessionBuffer** — `DebouncedFlush<SessionBuffer>` keyed by `sessionKey || agentId || "default"`.
- **NativeMemory** — indexer scans `{workspaceDir}/MEMORY.md` and `{workspaceDir}/memory/*.md`, marks files with `GRALKOR_MARKER` so re-indexing is a cheap disk read. Fires fire-and-forget from `before_prompt_build` into the current session's `groupId`.

### Plugin Registration

- `register(api)` **must be synchronous** — async silently registers nothing.
- Config arrives on `api.pluginConfig`. `resolveConfig()` merges defaults; `validateOntologyConfig()` runs.
- `registerFullPlugin()` owns shared state: `groupIdBySession` Map (with `getGroupId`/`setSessionData`), `serverReady` gate, module-level `ReadyGate` (survives reloads).
- Server lives at `http://127.0.0.1:8001`.

### Plugin API Contract

- `api.pluginConfig` — plain object from `plugins.entries.<id>.config`
- `registerTool({ execute(toolCallId, params, signal, onUpdate) })` — plain tool, no factory
- `api.on(event, handler)` preferred; `registerHook` crashes without `metadata: { name }`
- `registerService({ id, start, stop })` — `id` not `name`. `registerCli` mounts under `openclaw`. Plugins do no LLM inference.

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

(Behavioural details live in the Recall, Capture, and Tools test trees below.)

- **Auto-recall** (`before_prompt_build`): `extractInjectQuery` → register session in `groupIdBySession` (`setSessionData`) and `messagesBySession` (`setSessionMessages`) → fast-mode `client.search()` → `interpretFacts()` (shared helper, ~250K token budget, oldest dropped first; no fallback if `llmClient` is missing) → returns `<gralkor-memory trust="untrusted">` with `Session-key:` injected.
- **Auto-capture** (`agent_end` → `DebouncedFlush` keyed by `sessionKey || agentId || "default"` → `session_end` force-flush): `extractMessagesFromCtx` cleans messages, `formatTranscript(messages, llmClient)` (in `src/distill.ts`) groups thinking/`tool_use`/`tool_result` per turn and distils each into a first-person `(behaviour: …)` line, then `client.ingestEpisode({ episode_body })`.
- **Flush retries**: 3× exponential (1s/2s/4s), 4xx not retried. SIGTERM → `flushAll()` once via module guard.

### Graph Partitioning

- Tools have no ctx; they require `session_key` which the model reads back from the injected memory block. `getGroupId(sessionKey)` **throws** for unregistered keys — no silent fallback to a wrong partition.
- `sanitizeGroupId` (hyphens → underscores) runs **once** at write time inside `setSessionData`; all readers get the pre-sanitized value from the map.
- graphiti-core: `add_episode()` clones the driver per `group_id`, but `search()` doesn't route — fixed by `_ensure_driver_graph()` in `main.py`.
- **Driver lock:** `graphiti.driver` is a global mutated by both `add_episode()` and `_ensure_driver_graph()`. Concurrent requests for different `group_id`s can interleave and clobber each other's driver state, losing data on writes and returning wrong results on reads. Fix: `_driver_lock = asyncio.Lock()` in `main.py` serializes all `add_episode`, `search`, and `build_communities` calls. Single-user agent semantics make serialization acceptable.

### Server Manager Lifecycle

(See the Startup and `bundled-wheel-arch-selection` test trees.)

- Service `gralkor-server` lives in `src/server-manager.ts`. On `linux/arm64`: `resolveBundledWheels(serverDir, dataDir, version)` returns `${serverDir}/wheels/*.whl` (npm install path) else downloads from `github.com/elimydlarz/gralkor/releases/v${version}/` into `${dataDir}/wheels/` (ClawHub install path — wheel exceeds ClawHub's 20 MB upload limit). Then `uv sync --no-dev --frozen --no-install-package falkordblite` and `uv pip install --no-deps` the resolved wheel with `VIRTUAL_ENV` set. All other platforms: plain `uv sync --no-dev --frozen` (PyPI handles falkordblite correctly).
- API keys come from `config.*ApiKey` strings via `buildSecretEnv()` in `register.ts` — synchronous, no `process.env` reads.
- Pre-spawn: read `server.pid` from `dataDir`, SIGTERM the prior pid, poll until port is free (≤10s). Spawn uvicorn on `127.0.0.1:8001` with `CONFIG_PATH`/`FALKORDB_DATA_DIR`. Poll `/health` 500ms (120s timeout), then 60s monitor. Healthy → `serverReady.resolve()`. SIGTERM → 5s → SIGKILL. `stop()` deletes `server.pid`. First start ~1–2 min.
- **Service self-start** (`registerServerService` in `src/register.ts`): self-starts `manager.start()` fire-and-forget at registration time — bypasses a host bug where memory-kind plugins are excluded from the gateway startup scope. Manager cached at module level (`serverManager` in `src/index.ts`); after a host module re-evaluation, the pre-flight health check in `manager.start()` detects an already-running server and skips the spawn.

### Communication Path

Plugin → `GraphitiClient` (`src/client.ts`, HTTP) → REST → FalkorDB.

- 2 retries (500ms/1s) for network/5xx; 4xx immediate (except 429).
- `POST /search` returns `{ facts, nodes }`. Fast mode = `graphiti.search()` (RRF, edges only). Slow mode = `graphiti.search_()` with `COMBINED_HYBRID_SEARCH_CROSS_ENCODER` (cross-encoder + BFS, facts + entity summaries).
- `POST /episodes` carries pre-formatted `episode_body`; server passes verbatim to `graphiti.add_episode()`. UUID per call as `idempotency_key` (in-memory dedup, process lifetime).
- **Rate-limit passthrough:** middleware → 429 + `Retry-After`; client retries 429s indefinitely (guided by `Retry-After`), independent of the 5xx retry budget. Cancellable via `AbortSignal`.

## Requirements

### Functional

The test trees below are the contract. Each top-level name is a behaviour; nested `when`/`then` clauses are the spec. Tests in `src/*.test.ts`, `test/integration/`, `test/functional/`, and `server/tests/` mirror these one-to-one.

#### Recall

```
recall-interpretation
  applies to both auto-recall (fast) and memory_search tool (slow) — both share the same interpret helper
  when recall returns results
    then calls llmClient with conversation messages (within token budget) and raw facts
    and output includes "Interpretation:" section with LLM output after raw facts
  when conversation history exceeds the token budget
    then oldest messages are dropped until context fits
    and most recent messages are always preserved
  if llmClient is missing or the LLM call fails
    then the recall call throws (no fallback)
  for memory_search (slow)
    then conversation messages are looked up by session_key from the session message store
    when no messages have been recorded for the session
      then interpretation runs with empty conversation context
auto-recall-further-querying
  when auto-recall returns results
    then prependContext includes an instruction to search memory up to 3 times in parallel with diverse queries
  when memory_search tool execute returns results
    then response contains facts and an interpretation section
    and response does not contain further querying instruction
unified-search (memory_search tool)
  when session_key is not registered in the session map
    then throws error (does not route to default group)
  when searching
    when graph returns results
      then response includes graph facts under "Facts:" header
      and response includes an "Interpretation:" section produced by the shared interpret helper
    when neither returns results
      then response is "No facts found."
    when mode is "slow"
      then uses cross-encoder + BFS search (graphiti.search_())
      and returns at most search.maxResults facts (default 20) and search.maxEntityResults entities (default 10)
      and entity node summaries are returned alongside facts
      when node summaries are returned
        then nodes appear in output under "Entities:" section
      when no facts and no nodes are returned
        then response is "No facts found."
  when server is not ready
    then throws error
auto-recall-search-strategy
  when auto-recall executes
    then registers the session in the groupIdBySession map (setSessionData)
    and injects Session-key into the <gralkor-memory> block
    and retrieves groupId from the map for the search (not re-derived from agentId)
    and uses fast mode (RRF, edges only via graphiti.search())
    and returns at most autoRecall.maxResults facts (default 10) and 0 entities
extractInjectQuery
  then returns the trailing run of user messages from event.messages
  then each message is cleaned via cleanUserMessageText before inclusion
  then multiple consecutive user messages are joined in original order
  when trailing user messages are separated by no non-user messages
    then all are included (drip messages)
  when a non-user message appears between user messages
    then only user messages after the last non-user message are included
  when a user message is empty after cleaning
    then it is skipped (not included in the query)
  when all trailing user messages are empty after cleaning
    then returns null
  when messages array is empty
    then returns null
  when messages array has no user messages
    then returns null
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
  formatTranscript (plugin-side, src/distill.ts)
    when assistant message has thinking blocks
      then grouped into behaviour for that turn
    when assistant message has tool_use blocks
      then grouped into behaviour for that turn
    when assistant message has tool_result blocks
      then grouped into behaviour for that turn
    when turn has behaviour blocks and llmClient available
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
    when llmClient is null
      then behaviour blocks silently omitted, text blocks preserved
    when turn has only text blocks (no behaviour)
      then text rendered as "Assistant: {text}" with no behaviour line
    user messages
      then rendered as "User: {text}"
flushSessionBuffer
  when groupId is retrieved from the session map for the buffer key
    then uses that groupId for the episode (not re-derived from agentId)
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
  when session_key is not registered in the session map
    then throws error (does not route to default group)
  when server is not ready
    then throws error
```

#### Startup

```
startup
  then the server is started as fire-and-forget during registration
  then subsequent register() calls reuse the existing manager (no duplicate starts)
  when the port is already healthy
    then adopts the running server without killing or respawning
    and starts the health monitor
    and returns without writing a pid file
  when a previous pid is on record
    then sends SIGTERM to the previous pid
    and polls until the port is free (up to 10s) before spawning
  when stop() is called
    then deletes the pid file
  when self-start succeeds
    then serverReady resolves
  when self-start fails
    then the error is logged
    and serverReady remains unresolved
  native memory indexing
    then indexer is fired fire-and-forget from before_prompt_build on each session start
    then already-indexed files (marker at end) cost only a disk read — no server call
    when ctx.workspaceDir is set
      then uses ctx.workspaceDir as the workspace to scan
    when ctx.workspaceDir is not set
      then falls back to config.workspaceDir
    when workspaceDir does not exist
      then indexer skips without error
bundled-wheel-arch-selection
  when on linux/arm64 and the install dir (serverDir/wheels) has .whl files
    then resolveBundledWheels returns those paths (no network)
    and uv sync skips falkordblite (--no-install-package falkordblite)
    and the bundled wheel is installed via uv pip install --no-deps
  when on linux/arm64 and the install dir has no wheels
    and the cache (dataDir/wheels) already has the wheel
    then resolveBundledWheels returns the cached path (no network)
  when on linux/arm64 and neither the install dir nor the cache has the wheel
    then resolveBundledWheels downloads it from
      https://github.com/elimydlarz/gralkor/releases/download/v${version}/falkordblite-0.9.0-py3-none-manylinux_2_36_aarch64.whl
    and writes it into dataDir/wheels for reuse
    when the download responds non-2xx
      then throws (no PyPI fallback — the PyPI sdist embeds x86-64 binaries on glibc < 2.39)
  when on non-linux-arm64 (macOS, linux/x86-64)
    then resolveBundledWheels is not called
    and uv sync installs falkordblite from PyPI normally
  when bundled wheel install fails on linux/arm64
    then throws (no silent fallback to PyPI)
secret-resolution
  when config contains a plaintext API key string
    then env var is set to that string (trimmed)
  when config value is empty or whitespace
    then env var is not set
  when config value is undefined or absent
    then env var is not set
  then env vars are built synchronously and passed to the server manager
  then process.env is not read for API keys
native-memory-indexing
  discoverFiles(workspaceDir, groupId)
    then finds {workspaceDir}/MEMORY.md with caller-provided groupId
    then finds {workspaceDir}/memory/*.md with caller-provided groupId
    when workspaceDir does not exist
      then returns empty list
  indexFile
    when file has no marker
      then ingests entire file content
      and appends marker at end of file
    when file has marker at end (nothing after it)
      then skips ingest
      and does not modify the file
    when file has marker mid-file (new content after it)
      then ingests only content after the marker
      and moves marker to new end of file
    when ingest fails
      then does not move the marker (file left unchanged)
  runNativeIndexer(client, workspaceDir, groupId)
    when workspaceDir does not exist
      then skips gracefully without error
    when a file errors
      then logs error and continues with remaining files
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
config-defaults-single-source
  when configSchema is read from index.ts
    then defaults match defaultConfig in config.ts
  when openclaw.plugin.json is read
    then defaults match defaultConfig in config.ts
test-mode-query-logging
  when auto-recall searches in test mode
    then the extracted user message (search query) is logged
  when memory_search tool executes in test mode
    then the query argument is logged
  when test mode is disabled
    then queries are not logged
cross-encoder-selection
  when llm provider is gemini
    then uses GeminiRerankerClient
  when llm provider is not gemini and OPENAI_API_KEY is set
    then uses OpenAIRerankerClient
  when llm provider is not gemini and OPENAI_API_KEY is not set
    then cross_encoder is None
sanitizeGroupId
  when agentId contains hyphens
    then hyphens are replaced with underscores
  when agentId has no hyphens
    then returned unchanged
  then applied exactly once: at the setSessionData write boundary in index.ts
  then all readers (tools, auto-recall, flush) get the pre-sanitized value from the map
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
driver-lock-serialization
  when concurrent requests target different group_ids
    then add_episode, search, and build_communities are serialized (no concurrent execution)
downstream-error-handling
  server side
    when downstream LLM raises an error
      when status is 4xx
        when status is 429
          then handled by rate-limit-retry (not this handler)
        when status is 400
          when message indicates a credential failure (e.g. "API key expired")
            then returns 503 with {"error": "provider error", "detail": "<message>"}
          otherwise
            then returns 500 with {"error": "provider error", "detail": "<message>"}
        when status is 401 or 403
          then returns 503 with {"error": "provider error", "detail": "<message>"}
        when status is 404 or 422
          then returns 500 with {"error": "provider error", "detail": "<message>"}
        when status is any other 4xx
          then returns 502 with {"error": "provider error", "detail": "<message>"}
      when status is 5xx
        then returns 502 with {"error": "provider error", "detail": "<message>"}
      when no recognizable status code
        then propagates as 500
```

#### Functional Journey

```
memory-journey
  given workspace/memory/session-001.md seeded with "Eli has the lucky number LuckyNumber47" before gateway start
    when a real agent run (openclaw agent --agent main) triggers before_prompt_build
      then native indexer fires and indexes session-001.md to group "main" (ctx.workspaceDir + agentId)
      then injection reveals 47 as the current lucky number
    when the same real agent run captures the conversation (agent_end → flush)
      then 99 is searchable as the current lucky number
      when memory_add stores lucky number changed to 42
        then manual search reveals 42 as the current lucky number
        and earlier values (47, 99) appear in results as superseded (invalid_at set)
        and manual search returns both facts and entity nodes
  agent-partition-isolation
    given data stored under one group_id (session-keyed agent)
      then it is searchable within that group
      and it is NOT returned when searching a different group
  concurrent-agent-isolation
    given two agents writing to different groups simultaneously
      then alpha fact is searchable in alpha group
      and beta fact is searchable in beta group
      and alpha fact does NOT appear in beta group
      and beta fact does NOT appear in alpha group
  hyphenated-agent-id-sanitization
    given a real agent run through openclaw agent --agent my-hyphen-agent
      then the episode is stored under the sanitized group "my_hyphen_agent"
      and the fact IS searchable under "my_hyphen_agent"
      and the fact IS also searchable under "my-hyphen-agent" (server sanitizes group IDs to match)
  session-flush-write-read-symmetry
    given two concurrent session flushes to different groups (source: message)
      then session A data is readable from session A group
      and session B data is readable from session B group
      and session A data does NOT appear when reading session B group
      and session B data does NOT appear when reading session A group
```

#### Distribution

```
publish-version-integrity
  when publish succeeds
    then version is bumped in package.json and openclaw.plugin.json
    and a git tag is created for the new version (push manually)
  when not logged in to npm
    then exits before version bump
    and no rollback is needed
  when publish fails (build error or npm reject)
    then version files are rolled back to their pre-publish values
    and no git tag is created
  when successive publishes fail
    then version does not increment multiple times
  when DRY_RUN is set
    then version is bumped and synced across manifests
    and build and publish are skipped
    and no git tag is created
  when level is current
    then version is not incremented
    and manifests remain at current version
    and build and publish still run
    and a git tag is created for the current version
  when level is current and publish fails
    then no rollback runs
    and version files remain unchanged
publish-clawhub-version-integrity
  when publish succeeds
    then version is bumped in package.json and openclaw.plugin.json
    and a git tag is created for the new version (push manually)
  when not logged in to clawhub
    then exits before version bump
    and no rollback is needed
  when publish fails (build error or clawhub reject)
    then version files are rolled back to their pre-publish values
    and no git tag is created
  when successive publishes fail
    then version does not increment multiple times
  when DRY_RUN is set
    then version is bumped and synced across manifests
    and build and publish are skipped
    and no git tag is created
  when level is current
    then version is not incremented
    and manifests remain at current version
    and build and publish still run
    and a git tag is created for the current version
  when level is current and publish fails
    then no rollback runs
    and version files remain unchanged
clawhub-arm64-wheel-distribution
  then publish-clawhub.sh excludes server/wheels via .clawhubignore
    (the wheel exceeds ClawHub's 20 MB upload limit)
  then before publishing the package, publish-clawhub.sh uploads
    the freshly-built arm64 wheel to the matching v${version} GitHub Release
    (creating the release if it doesn't exist) via gh release upload
  when PUBLISH_SKIP_GH_RELEASE is set
    then the GitHub Release upload is skipped (used by tests)
  when no .whl file exists in server/wheels after the build step
    then the publish aborts with an error
  when gh release upload fails
    then publish-clawhub.sh exits non-zero (rollback fires for non-current levels)
publish-all
  when publish:all succeeds
    then npm is published first with the version bump
    and clawhub is published second at the bumped version (current)
    and only one version bump occurs
  when npm publish fails
    then clawhub publish does not run
  when npm publish succeeds but clawhub publish fails
    then a recovery hint is printed directing the user to run publish:clawhub current
install-sequencing-docs
  then README documents recommended install sequencing for operators
```

### Cross-functional

| Requirement | Implementation |
|---|---|
| fail-fast | `ReadyGate` (module-level `src/config.ts`): before ready → throw. Graph failures propagate. |
| observability | Two-tier `[gralkor]` logging. Config logged once (`configLogged` flag). Normal: metadata. Test: full data. `[gralkor] boot:` markers: `register()` logs `boot: plugin loaded (v...)` on first call, `boot: register() failed:` on error; server-manager logs `boot: starting/ready`; health poll logs unique errors and attempt count; self-start logs success/failure. |
| retry-backoff | Client: 2 retries (500ms/1s) network/5xx. Flush: 3 retries (1s/2s/4s). 4xx not retried (except 429 — see rate-limit-passthrough). |
| rate-limit-passthrough | Middleware: `RateLimitError` → 429 + `Retry-After` header. Client retries 429s indefinitely (guided by `Retry-After`), independent of 5xx retry budget. |
| downstream-error-handling | Middleware: provider errors with HTTP status codes are mapped to structured responses. 400 (non-credential) / 404 / 422 → 500 `{"error":"provider error"}`; 400 (credential hint, e.g. Gemini expired key) / 401 / 403 → 503; 4xx (other) / 5xx → 502. Errors without a status code propagate as 500. |
| untrusted-context | Facts in `<gralkor-memory trust="untrusted">` XML |
| health-monitoring | 60s ping on child process |
| capture-hygiene | `SYSTEM_MESSAGE_PATTERNS` in `src/hooks.ts`. User: unwrap metadata → strip XML/footer → filter system lines. Assistant: per-block `isSystemMessage()`. `"tool"` = `"toolResult"`. |
| prompt-robustness | `extractInjectQuery` reads trailing user messages from `event.messages` (ignores `event.prompt`); each cleaned via `cleanUserMessageText` |
| query-sanitization | `_sanitize_query()` strips backticks (RediSearch). `sanitizeGroupId()` replaces hyphens with underscores in group IDs to avoid RediSearch syntax errors. |
| bundled-arm64-wheel | `scripts/build-arm64-wheel.sh` builds falkordblite for linux/arm64 via Docker; called by `pack.sh`, `publish-npm.sh`, and `publish-clawhub.sh`. Wheel is shipped two ways: (a) bundled inside the npm tarball under `server/wheels/`; (b) uploaded as a GitHub Release asset by `publish-clawhub.sh` (`gh release upload v${version}`) and downloaded on first start by `resolveBundledWheels()` because it exceeds ClawHub's 20 MB package upload limit. Only activated on `linux/arm64` at runtime — other platforms use PyPI via `uv sync` |
| configurable-providers | `llm`/`embedder`/`cross_encoder` in config; dynamic `config.yaml` at startup. `_build_cross_encoder()` matches reranker to LLM provider (Gemini → `GeminiRerankerClient`, OpenAI key present → `OpenAIRerankerClient`, otherwise `None`). |
| episode-idempotency | UUID per call; server deduplicates (in-memory, process lifetime) |

## Repo Map

```
├── CLAUDE.md / package.json / tsconfig.json / vitest.config.ts
├── openclaw.plugin.json              # active manifest
├── src/                              # index.ts (entry), register.ts, tools.ts, hooks.ts,
│                                     # client.ts, server-manager.ts, native-indexer.ts,
│                                     # types.ts, config.ts, llm-client.ts, distill.ts,
│                                     # *.test.ts
├── scripts/pack.sh                   # deployment tarball
├── test/integration/                 # mocked integration tests (multi-load, publish)
├── test/functional/                  # real OpenClaw harness tests (Docker, no mocks)
├── server/                           # Python/FastAPI: main.py, tests/, wheels/
└── dist/                             # compiled JS (git-ignored)
```

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `autoCapture.enabled` | boolean | `true` | Auto-store conversations |
| `autoRecall.enabled` | boolean | `true` | Auto-inject context |
| `autoRecall.maxResults` | number | `10` | Max facts injected by auto-recall |
| `search.maxResults` | number | `20` | Max facts returned by memory_search tool |
| `search.maxEntityResults` | number | `10` | Max entities returned by memory_search tool |
| `idleTimeoutMs` | number | `300000` | Flush timeout (ms); races `session_end` |
| `llm.provider` | string | `"gemini"` | LLM provider (gemini, openai, anthropic, groq) |
| `llm.model` | string | `"gemini-3.1-flash-lite-preview"` | LLM model |
| `embedder.provider` | string | `"gemini"` | Embedding provider (gemini, openai) |
| `embedder.model` | string | `"gemini-embedding-2-preview"` | Embedding model |
| `dataDir` | string | **(required)** | Persistent data directory (venv, FalkorDB). No default — operator must set. |
| `workspaceDir` | string | `~/.openclaw/workspace` | Native memory workspace root. Scanned at startup for MD files to index. |
| `ontology.entities` | `Record<string, OntologyTypeDef>` | — | Custom entity types |
| `ontology.edges` | `Record<string, OntologyTypeDef>` | — | Custom edge types |
| `ontology.edgeMap` | `Record<string, string[]>` | — | `"EntityA,EntityB"` → edges |
| `test` | boolean | `false` | Verbose logging both layers |
| `googleApiKey` | secret | — | Google API key for Gemini |
| `openaiApiKey` | secret | — | OpenAI API key |
| `anthropicApiKey` | secret | — | Anthropic API key |
| `groqApiKey` | secret | — | Groq API key |

## Environment Variables

API keys live in plugin config as plain strings (gateway resolves SecretRefs upstream). `buildSecretEnv()` in `src/register.ts` maps them to env vars; the server manager writes `config.yaml` and forwards them at startup. See the `secret-resolution` test tree.

## Dev Workflow

```bash
openclaw plugins install -l .         # install locally for dev
pnpm run typecheck                    # type-check TypeScript
pnpm test                             # typecheck + unit + integration
pnpm run test:unit                    # TS unit (vitest src/) + Python unit (pytest, mocked)
pnpm run test:integration             # TS integration (test/integration/) + Python integration (real FalkorDBLite)
pnpm run test:functional              # Docker harness end-to-end
pnpm run setup:server                 # first time: sync server venv
```

TDD: failing tests first. Tree reporters (vitest `tree`, pytest `--spec`).

### Test Strategy

Three layers, each with both a TypeScript and a Python half so the language split doesn't muddy the layer split:

- **Unit** — fast, isolated, mocked collaborators. TS: `src/*.test.ts` (vitest). Python: `server/tests/*.py` excluding `test_integration.py` (pytest with mocked Graphiti). `pnpm run test:unit` runs both halves; `:ts` / `:py` run just one.
- **Integration** — cross-module wiring, real adjacent components, no Docker. TS: `test/integration/*.integration.test.ts` (vitest, mocked external services but real plugin lifecycle). Python: `server/tests/test_integration.py` (real FalkorDBLite, real Graphiti). `pnpm run test:integration` runs both; `:ts` / `:py` for one.
- **Functional** — `test/functional/` end-to-end against a real OpenClaw + real LLM inside the Docker harness. No mocks. `pnpm run test:functional`; `:both` for arm64 + amd64.
- **Live distillation** (out-of-band): `cd server && uv run pytest tests/test_distillation_live.py -v -s`. Run after changing `_DISTILL_SYSTEM_PROMPT` or the default LLM. Fixtures: `server/tests/fixtures/distillation_cases.json`. Output: `server/tests/distillation_results/` (gitignored).

## Building & Deploying

`pnpm run publish:all -- patch|minor|major` bumps, builds, publishes to npm + ClawHub, commits and tags. `publish:npm` / `publish:clawhub` for one-at-a-time (each accepts `current` to skip the bump). `pnpm run pack` builds a deployment tarball (arm64 wheel via Docker). See the publish test trees for behaviour. Requires `uv`. Docker HOME split: `ln -sfn /data/.openclaw /root/.openclaw`.

**ClawHub uploads** are governed by `.clawhubignore` (gitignore syntax) — the clawhub CLI ignores `package.json`'s `files` field and `.gitignore`/`.npmignore`, so the file uses a whitelist (`*` + `!`-unignores) mirroring npm's `files`, plus an explicit `.env*` deny. `server/wheels/` is excluded (20 MB limit); `publish-clawhub.sh` instead `gh release upload`s the arm64 wheel to the matching `v${version}` release.

## Conventions

- TypeScript, ESM, ES2022, bundler resolution. `.js` extensions required.
- All Graphiti communication via HTTP through `src/client.ts`
- Targets OpenClaw 2026.4.2 (pinned in `peerDependencies.openclaw` in `package.json` — single source of truth; `build.sh` passes this to Docker as `OPENCLAW_VERSION`). Do not add compatibility shims or workarounds for older versions.
  - **To update the targeted OpenClaw version:** change `peerDependencies.openclaw` (and `dependencies.openclaw`) in root `package.json` to the new exact version. That's it — `build.sh` reads it and passes `--build-arg OPENCLAW_VERSION=<version>` to docker, the `Dockerfile` ARG default is cosmetic only. Also update `README.md` (`Prerequisites` line). The `test/harness/gralkor-src/package.json` is overwritten at build time by `build.sh` (it copies root `package.json` into the build context), so it doesn't need a separate edit.
- When understanding current OpenClaw behaviour, check the clone at `/tmp/openclaw` — always run `git pull` there first to ensure it reflects the latest version

## Gotchas

- `register()` must be synchronous — async silently registers nothing
- `falkordblite` installs as Python module `redislite`, not `falkordblite`
- `falkordblite` 0.9.0: PyPI arm64 wheel requires `manylinux_2_39` (glibc 2.39+) but Bookworm ships glibc 2.36, so `uv sync` falls back to the sdist which embeds x86-64 binaries → `RedisLiteServerStartError` on arm64. Fix: prebuilt wheel from `build-arm64-wheel.sh`. Server-manager gates on `process.platform === "linux" && process.arch === "arm64"` and resolves the wheel via `resolveBundledWheels()`: install dir first (`server/wheels/*.whl`, npm publish path), else download from `github.com/elimydlarz/gralkor/releases/v${version}` into `${dataDir}/wheels/` (ClawHub publish path — wheel exceeds ClawHub's 20 MB upload limit so it's hosted as a GH release asset by `publish-clawhub.sh` instead). Hard failure if neither resolution succeeds. All other platforms (macOS, linux/x86-64) use PyPI via normal `uv sync`. Dockerfile mirrors the install-dir path with `TARGETARCH` conditional.
- ClawHub publish walks the entire repo respecting only `.git/`, `node_modules/`, and `.clawhubignore` — NOT `.gitignore`, `.npmignore`, or `package.json`'s `files` field. Without `.clawhubignore` it would try to upload everything (including `.env`!). The whitelist there mirrors npm's `files`.
- Graphiti requires LLM API key — starts without one but all operations fail
- `AbortError` in auto-capture — from Node HTTP layer (connection reset/SIGTERM), not gateway
- Native `memory_search` empty without embedding provider (upstream bug)
- **graphiti-core search doesn't route:** `add_episode()` clones driver per `group_id`, `search()` doesn't. Fix: `_ensure_driver_graph()`. `FalkorDriver.__init__()` fires index build on every clone (noisy but caught). Both operations are serialized under `_driver_lock` to prevent concurrent driver mutations from clobbering each other.
- **Plugin tools blocked by tool profiles:** `coding` profile allowlists core tools only. Plugin tools (`memory_add`, `memory_build_indices`, `memory_build_communities`) are filtered out. Workaround: `"alsoAllow": ["memory_add", "memory_build_indices", "memory_build_communities"]` or `"alsoAllow": ["gralkor"]` in `tools` config.

