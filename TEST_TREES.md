# Test Trees — Gralkor

These trees are the contract between intent and implementation. Each top-level name is a behaviour; nested `when`/`then` clauses are the spec. Tests in `src/*.test.ts`, `test/integration/`, `test/functional/`, and `server/tests/` mirror these one-to-one.

Never modify silently. If implementation has drifted, decide explicitly: update the trees (and tests) to match, or pare the implementation back.

## Canonical turn shape

```
canonical-message (shared)
  a captured turn is a list of messages with:
    role ∈ {"user", "assistant", "behaviour"}
    content: str (opaque — adapters render harness-internal events however they like)
  the server never branches on content interior structure — only on role (for distillation labels
    and interpretation context). Anything the server wants to strip or rewrite (gralkor-memory
    envelopes, system-line artefacts, etc.) is an adapter concern and lives in the harness's
    adapter, not here.
```

## Recall

```
recall-interpretation
  applies to both auto-recall (fast) and memory_search tool (slow) — both share the same interpret helper
  when recall returns results
    then calls llmClient with conversation messages (within char budget) and raw facts
    and output includes "Interpretation:" section with LLM output after raw facts
  when conversation history exceeds the char budget
    then oldest messages are dropped until context fits
    and most recent messages are always preserved
  if llmClient is missing or the LLM call fails
    then the recall call throws (no fallback)
  for server-side endpoints (POST /recall and POST /tools/memory_search)
    then conversation messages are sourced by flat-walking every buffered turn for the session,
      preserving order and role
    when no turns have been captured for the session
      then interpretation runs with empty conversation context
POST /recall endpoint
  request shape
    then body is {session_id, group_id, query, max_results}
    then group_id is sanitized (hyphens → underscores) before use
    then driver is routed to target graph (_ensure_driver_graph) before search
  if session_id is missing or blank
    then 422 is returned (Gralkor requires a non-blank session_id)
  conversation context
    then messages are sourced from capture_buffer.turns_for(session_id), flat-walked
    then every Message in every buffered turn is included in order, with its role label
    when the session has no entry in capture_buffer
      then interpretation runs with an empty conversation context (no error)
    when two sessions share a group_id
      then each session's recall sees only its own buffered turns
    then the server never strips or rewrites Message content — adapters hand in clean strings
  when graph returns no facts
    then response is {"memory_block": ""} (empty string, not null)
    and interpret is not called
  when graph returns facts
    then fast mode search is used (graphiti.search, edges only, RRF)
    and facts are formatted via format_fact
    and interpret_facts is called with the session's buffered conversation and formatted facts
    and response wraps output in <gralkor-memory trust="untrusted">...</gralkor-memory>
    and response includes "Facts:" section with formatted facts
    and response includes "Interpretation:" section with LLM output
    and response includes further-querying instruction ("Search memory (up to 3 times, diverse queries)...")
  when search is called concurrently for different group_ids
    then _driver_lock serializes the calls
  when autoRecall.maxResults config is set
    then at most that many facts are returned (default 10)
  observability
    then logs "[gralkor] recall — session:… group:… queryChars:… max:…" at INFO on every call
    then logs "[gralkor] recall result — <N> facts blockChars:… <ms>" at INFO on every call (0 facts included)
    when test mode is enabled (logger level DEBUG)
      then also logs "[gralkor] [test] recall query: <raw query>" at DEBUG
      and when facts are returned also logs "[gralkor] [test] recall block: <memory block>" at DEBUG
interpret-facts (Python)
  when llm_client is None
    then raises (fail-fast; no fallback)
  when llm_client returns empty or whitespace response
    then raises
  when conversation history fits within char budget
    then all messages passed to LLM with formatted facts
  when conversation history exceeds char budget (250_000 * 4)
    then oldest messages are dropped until context fits
    and most recent messages are always preserved
  then uses INTERPRET_SYSTEM_PROMPT
  then passes response_model with a single "text" field to generate_response
  then returns the trimmed .text field from the response dict
build_interpretation_context (Python)
  then labels each message by role: "User", "Assistant", "Agent did" (for behaviour)
  then drops messages with empty cleaned content
  then assembles context as "Conversation context:\n{messages}\n\nMemory facts to interpret:\n{facts}"
  when total char length exceeds budget
    then oldest messages are dropped until context fits
  then does NOT inspect or mutate content beyond whitespace trimming (no XML stripping,
    no system-line filtering — those are adapter concerns)
```

## Capture

```
POST /distill endpoint
  request shape
    then body is {turns: [[{role, content}, …]]} — each turn is a list of canonical Messages
  then calls format_transcript(turns, graphiti.llm_client)
  then response is {"episode_body": string}
  when multiple turns contain behaviour messages
    then distillation runs in parallel (asyncio.gather) — one LLM call per turn
  when a single turn's distillation raises
    then that turn's behaviour line is silently dropped (empty string)
    and surrounding turns still produce output
  when a turn has only user and assistant messages (no behaviour)
    then rendered as "User: …\nAssistant: …" with no behaviour line, no LLM call
POST /capture endpoint
  request shape
    then body is {session_id, group_id, messages: [{role, content}, …]}
    then role ∈ {"user", "assistant", "behaviour"}; content is a string the adapter produced
  if session_id is missing or blank
    then 422 is returned (Gralkor requires a non-blank session_id)
  then appends the message list to capture_buffer keyed by session_id (group_id is sanitized
    and bound to the entry on first append)
  then returns 204 No Content (no body)
  then returns immediately (does not call distill synchronously)
  when idle_seconds elapses after the last append
    then flush is triggered via the registered callback, routed to the bound group_id
  observability
    when test mode is enabled (logger level DEBUG)
      then logs "[gralkor] [test] capture messages: [(role, content), …]" at DEBUG
  idle flush (_capture_flush in main.py)
    when the distilled episode body is empty
      then does not call add_episode (no log)
    when the episode is added
      then logs "[gralkor] capture flushed — group:… uuid:… bodyChars:… <ms>" at INFO
    when test mode is enabled
      then also logs "[gralkor] [test] capture flush body: <episode_body>" at DEBUG
POST /session_end endpoint
  request shape
    then body is {session_id}
  when called for a session_id with buffered turns
    then the session's idle timer is cancelled
    and the session's buffered turns are flushed via the same callback and retry machinery as idle flush
    and 204 No Content is returned without awaiting the flush completion
  when called for a session_id with no buffered turns
    then 204 No Content is returned and no flush is scheduled
  if session_id is missing or blank
    then 422 is returned
  observability
    then logs "[gralkor] session_end session:… turns:N" at INFO
capture-buffer (Python)
  append
    when called for a new session_id
      then entry created bound to the supplied group_id and the turn (list of Messages)
      and idle timer scheduled
    when called again for same session_id before idle elapses
      then idle timer is cancelled and rescheduled
      and both turns remain buffered
    when called for multiple session_ids (same or different group_id)
      then each session_id has an independent entry and timer
    when called for an existing session_id with a different group_id
      then raises (sessions are not re-bindable across groups)
  turns_for(session_id)
    when the session has buffered turns
      then returns list[list[Message]] in append order — each turn is a list of Messages
    when the session has never been appended to (or was just flushed)
      then returns an empty list
  flush on idle
    when idle_seconds elapses
      then flush_callback is invoked with (group_id, list[list[Message]]) derived from the entry
      and the entry is removed from the buffer
      and subsequent turns_for(session_id) calls return []
  flush(session_id)
    when called for a session_id with buffered turns
      then the session's idle timer is cancelled
      and flush_callback is scheduled with (group_id, list[list[Message]]) derived from the entry
      and the call returns without awaiting the scheduled flush
      and the entry is removed from the buffer
      and subsequent turns_for(session_id) calls return []
    when called for a session_id with no entry
      then returns without scheduling any flush
  retry schedule
    when flush_callback raises a retryable error
      then retries at 1s, 2s, 4s (exponential)
    when flush_callback raises after 3 retries
      then logs "capture exhausted" and drops
    when flush_callback raises a 4xx-equivalent error
      then does not retry and logs "capture dropped (4xx)"
  flush_all
    when called with pending entries
      then cancels all idle timers
      and awaits all pending flushes
    when called with no entries
      then returns immediately
    when one flush fails and another succeeds
      then the successful flush still completes
  lifespan shutdown
    when FastAPI lifespan enters shutdown
      then capture_buffer.flush_all is awaited
format-transcript (Python)
  inputs
    then takes list[list[Message]] — each turn is a list of canonical Messages
  distill input per turn
    when a turn contains a message with role="behaviour"
      then all messages in the turn are rendered with role labels ("User: …", "Agent did: …",
        "Assistant: …") and passed to the distill LLM as the "thinking" prompt
    when a turn has no behaviour messages
      then distillation is skipped for that turn (no LLM call)
  transcript rendering
    when a turn has behaviour and llm_client is available
      then distilled via llm_client into first-person past-tense summary
      and rendered as "Assistant: (behaviour: {summary})" before the assistant text for that turn
    when distillation fails for a turn (safe_distill)
      then behaviour line silently dropped, user/assistant text preserved
    when llm_client is None
      then behaviour lines are silently omitted, user/assistant text preserved
    when a turn has no behaviour
      then rendered as "User: …\nAssistant: …" with no behaviour line, no LLM call
  then passes response_model with a single "behaviour" field to generate_response
  then parallel distillation across turns with behaviour via asyncio.gather
```

## Tools

```
POST /tools/memory_search endpoint
  request shape
    then body is {session_id, group_id, query, max_results, max_entity_results}
  if session_id is missing or blank
    then 422 is returned (Gralkor requires a non-blank session_id)
  then group_id is sanitized before use
  then driver is routed to target graph before search
  then uses slow mode (graphiti.search_) with COMBINED_HYBRID_SEARCH_CROSS_ENCODER
  then returns {"text": string}
  conversation context
    then messages are sourced from capture_buffer.turns_for(session_id) (same rules as /recall)
    when the session has no buffered turns
      then interpretation runs with an empty conversation context
  when graph returns facts and entities
    then response contains "Facts:" section (formatted via format_fact)
    and response contains "Entities:" section (formatted via format_node)
    and response contains "Interpretation:" section
    and response does NOT contain further-querying instruction
    and interpret_facts is called with the session's buffered conversation
  when graph returns no facts and no entities
    then response is "Facts: (none)\nEntities: (none)"
    and interpret is NOT called
  when at most search.maxResults facts are returned (default 20)
    and at most search.maxEntityResults entities are returned (default 10)
  when search is called concurrently for different group_ids
    then _driver_lock serializes the calls
  observability
    then logs "[gralkor] tools.memory_search — session:… group:… queryChars:… max:<res>/<ent>" at INFO on every call
    then logs "[gralkor] tools.memory_search result — <N> facts <M> entities textChars:… <ms>" at INFO on every call (0/0 included)
    when test mode is enabled (logger level DEBUG)
      then also logs "[gralkor] [test] tools.memory_search query: <raw query>" at DEBUG
      and when facts or entities are returned also logs "[gralkor] [test] tools.memory_search text: <text>" at DEBUG
POST /tools/memory_add endpoint
  request shape
    then body is {group_id, content, source_description?}
  then auto-generates name ("manual-add-" + timestamp_ms)
  then auto-generates idempotency_key (uuid4)
  then calls graphiti.add_episode with source=EpisodeType.text under _driver_lock
  then group_id is sanitized before ingestion
  then passes current ontology (entity_types, edge_types, edge_type_map)
  then response is {"status": "stored"}
  when source_description is omitted
    then defaults to "manual"
POST /build-indices endpoint
  request shape
    then body is {} (no arguments — the operation runs across the whole graph, not a specific group)
  then calls graphiti.build_indices_and_constraints() under _driver_lock
  then response is {"status": string}
  (admin-only — the adapter libraries expose this as an explicit call; consumer harnesses guard invocation with DO-NOT-CALL-UNLESS-ASKED semantics)
POST /build-communities endpoint
  request shape
    then body is {group_id}
    then group_id is sanitized before use
  then calls graphiti.build_communities for that group under _driver_lock
  then response is {"communities": non_neg_integer, "edges": non_neg_integer} with the counts produced
  (admin-only — expensive per-group operation; harness-level DO-NOT-CALL guards apply)
```

## Startup

```
ex-server-lifecycle (Elixir supervisor in ex/)
  init
    when init returns
      then it never blocks (handle_continue(:boot) runs the slow work)
  boot sequence
    when handle_continue(:boot) runs
      then Gralkor.Config.write_yaml writes config.yaml at $GRALKOR_DATA_DIR/config.yaml
      then Port.open spawns "uv run uvicorn main:app --host 127.0.0.1 --port 4000 --timeout-graceful-shutdown 30" with cd: server_dir
      then env vars are forwarded: GOOGLE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, FALKORDB_DATA_DIR, CONFIG_PATH
      then Gralkor.Health.check(/health) polls at 500ms intervals until 200 or the configured boot_timeout_ms (default 120_000)
    when the deadline passes with no healthy response
      then stops with {:boot_failed, :boot_timeout} (supervisor restart)
    when the spawned port exits during boot
      then the boot loop peeks the mailbox each iteration and fails fast
      then stops with {:boot_failed, :port_exited} (no full-timeout wait)
    when the configured port is already bound (orphan from a prior BEAM crash or any other listener)
      then stops with {:boot_failed, :port_in_use} before spawning (no crash-loop of doomed uvicorn attempts)
    when boot succeeds
      then health monitor is scheduled at the configured monitor_interval_ms (default 60_000)
  health monitor
    when /health check returns 200
      then reschedules itself at the configured monitor_interval_ms
    when /health check fails (5xx or transport error)
      then GenServer stops with {:health_degraded, reason}
      then supervisor restarts the GenServer (which respawns Python)
    then Gralkor.Health.check disables Req's implicit retry (retry: false) — a single failed poll must surface immediately, not incur Req's 1s/2s/4s retry schedule
  python crash
    when Port emits {:exit_status, N}
      then GenServer stops with {:python_exited, N}
      then supervisor restarts
  graceful shutdown
    when terminate/2 runs with a live port
      then extracts OS pid via Port.info(port, :os_pid)
      then sends SIGTERM via System.cmd("kill", ["-TERM", pid])
      then waits up to 30s for {port, {:exit_status, _}}
      then sends SIGKILL via System.cmd("kill", ["-KILL", pid]) if still running
ex-config-writing (Gralkor.Config)
  from_env
    when GRALKOR_DATA_DIR is set
      then data_dir is that value
    when GRALKOR_DATA_DIR is a relative path
      then data_dir is expanded to absolute (the Python child runs with a different cwd)
    when GRALKOR_DATA_DIR is missing
      then raises (fail-fast)
    when provider/model env vars are unset
      then the corresponding fields are left nil (the server applies defaults)
  write_yaml
    then creates data_dir if missing
    then writes config.yaml with valid YAML that Python's yaml.safe_load parses
    when llm_provider is set
      then emits "llm:" with the provider
      when llm_model is also set
        then emits "  model: <value>" under llm
      when llm_model is nil
        then omits the model line
    when llm_provider is nil
      then omits the llm section entirely (server applies default)
    (embedder section follows the same rules)
ts-server-manager (createServerManager in ts/)
  bundledServerDir
    then resolves to the "server" sibling of the compiled module's directory (i.e. <pkg>/server/) — mirrors the Elixir side's :code.priv_dir(:gralkor_ex) ++ "/server"
  construction
    then serverDir defaults to bundledServerDir() (the copy shipped inside @susu-eng/gralkor-ts)
    then consumers may override serverDir to point at a development checkout
    then the returned manager starts with isRunning() === false
  serializeOntologyYaml (helper written into config.yaml at start time)
    when the ontology has entities
      then emits an "ontology: entities:" block with description and optional attribute entries
    when the ontology has edges
      then emits an "edges:" block under ontology
    when the ontology has an edgeMap
      then emits an "edgeMap:" block with "EntityA,EntityB" keys and their edge lists
    when the ontology is empty (no entities, edges, or edgeMap)
      then emits just "ontology:\n"
  start — adopt path
    when another process already serves /health on the configured port (pre-flight check)
      then the manager adopts it (no spawn) and returns once healthy
      and starts the health monitor
  start — spawn path (NOT covered by unit tests; exercised only by consumers in production)
    when no process serves /health
      then uv run uvicorn main:app is spawned with cwd = serverDir
      and env includes GOOGLE_API_KEY / ANTHROPIC / OPENAI / GROQ where supplied
      and /health is polled at 500ms intervals until 200 or the boot window expires
    if /health never returns 200 within the boot window
      then start rejects with a timeout error
  health monitor (NOT covered by unit tests; exercised only by consumers in production)
    then after the server is healthy, /health is polled every 60s
    when /health returns non-2xx or errors
      then the failure is logged (monitor keeps polling; does not kill the server)
  stop (NOT covered by unit tests; exercised only by consumers in production)
    when the spawned process is ours
      then SIGTERM is sent and we wait up to STOP_GRACE_MS for clean exit
      if the process is still running after the grace window
        then SIGKILL is sent
ts-bundle-server (scripts/bundle-server.mjs)
  then runs as the pre-build step (package.json's "build": "pnpm run bundle-server && tsc")
  when gralkor/server/ exists at ../server relative to ts/
    then its contents are copied into ts/server/
    and destination is wiped before copy (no stale files)
    and these paths are skipped: .venv, .pytest_cache, __pycache__, wheels, tests, mutants, tmp
    and these extensions are skipped: *.pyc
    (matches Mix.Tasks.Compile.GralkorPriv's skip list so both adapters ship the same slice)
  when ../server does not exist
    then the script exits non-zero (caller must fix the path)
  then ts/server/ is gitignored (build artifact, regenerated from canonical source on every publish)
  then package.json's files: includes "server" so the bundle ships in the npm tarball
```

## Configuration

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
server-config-defaults (server/main.py)
  when config omits llm.provider
    then _build_llm_client uses DEFAULT_LLM_PROVIDER ("gemini")
  when config omits llm.model and provider is gemini
    then _build_llm_client uses DEFAULT_LLM_MODEL ("gemini-3.1-flash-lite-preview")
  when config omits llm.model and provider is not gemini
    then no model is forced (delegates to graphiti-core provider defaults)
  when config omits embedder.provider
    then _build_embedder uses DEFAULT_EMBEDDER_PROVIDER ("gemini")
  when config omits embedder.model and provider is gemini
    then _build_embedder uses DEFAULT_EMBEDDER_MODEL ("gemini-embedding-2-preview")
  when config sets llm.provider / llm.model explicitly
    then those values take precedence over the defaults
  (the server is the single source of truth for model defaults — clients may write config.yaml with provider/model omitted and rely on these fallbacks)
cross-encoder-selection
  when llm provider is gemini
    then uses GeminiRerankerClient
  when llm provider is not gemini and OPENAI_API_KEY is set
    then uses OpenAIRerankerClient
  when llm provider is not gemini and OPENAI_API_KEY is not set
    then cross_encoder is None
```

## Operations

```
/health endpoint
  when graphiti is initialized and FalkorDB is connected
    then returns status ok with graph connected true and node/edge counts
  when graphiti is initialized but query fails
    then returns status ok with graph connected false and error message
  when graphiti is not initialized
    then returns status ok with graph connected false
rate-limit-retry
  server side
    when upstream LLM returns a rate-limit error
      then 429 response includes Retry-After header
    (client-side retry handling is no longer part of :gralkor_ex or @susu-eng/gralkor-ts — the adapters surface the 429 as an error and let consumers decide; see consumer-owned retry logic in @susu-eng/openclaw-gralkor if needed)
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

## Elixir Client

```
ex-client (port contract, shared)
  when recall/3 is called with group_id, session_id, and query
    when the backend has a memory block
      then {:ok, block} is returned
    when the backend has no memory
      then {:ok, nil} is returned
    if the backend fails
      then {:error, reason} is returned
  when capture/3 is called with session_id, group_id, and messages
    messages is a list of canonical Gralkor.Message structs (role ∈ {"user", "assistant", "behaviour"}, content: String.t())
    when the backend acknowledges the capture
      then :ok is returned
    if the backend fails
      then {:error, reason} is returned
  when end_session/1 is called with a session_id
    when the backend acknowledges the end
      then :ok is returned
    if the backend fails
      then {:error, reason} is returned
  when memory_search/3 is called with group_id, session_id, and query
    when the backend returns results
      then {:ok, text} is returned
    if the backend fails
      then {:error, reason} is returned
  when memory_add/3 is called with group_id, content, and source_description
    when the backend acknowledges the add
      then :ok is returned
    if the backend fails
      then {:error, reason} is returned
  when health_check/0 is called
    when the backend is healthy
      then :ok is returned
    if the backend fails
      then {:error, reason} is returned
  when build_indices/0 is called
    when the backend acknowledges the rebuild
      then {:ok, %{status: String.t()}} is returned
    if the backend fails
      then {:error, reason} is returned
  when build_communities/1 is called with a group_id
    when the backend returns counts
      then {:ok, %{communities: non_neg_integer(), edges: non_neg_integer()}} is returned
    if the backend fails
      then {:error, reason} is returned
ex-sanitize-group-id
  when the id contains hyphens
    then hyphens are replaced with underscores
  when the id has consecutive hyphens
    then each hyphen is replaced independently
  when the id has no hyphens
    then it is returned unchanged
ex-impl-resolver
  when :gralkor_ex/:client is unset in app env
    then Gralkor.Client.HTTP is returned
  when :gralkor_ex/:client is configured to a module
    then that module is returned
ex-client-http
  then no Authorization header is attached to any request
  if Gralkor responds with a non-2xx status
    then {:error, {:http_status, status, body}} is returned
  if the app env is missing
    then the call raises
  if session_id is blank on recall/capture/memory_search/end_session
    then the call raises with ArgumentError (Gralkor requires a non-blank session_id)
  runs the shared ex-client port contract (via test/support/gralkor_client_contract.ex)
ex-client-in-memory
  when an operation is called
    then the call is recorded with its arguments for later inspection
  if no response is configured for an operation
    then {:error, :not_configured} is returned
  when reset/0 is called
    then configured responses and recorded calls are cleared
  runs the shared ex-client port contract (via test/support/gralkor_client_contract.ex)
ex-connection
  when starting up
    then Gralkor.Client.health_check/0 is polled until it responds :ok, blocking boot
    if Gralkor does not respond healthy within the boot window
      then startup fails so the supervisor can react
  after boot
    then the process is idle (no periodic polling) — runtime outages surface on the next actual call
ex-orphan-reaper
  when no process is listening on port 4000
    then no kill is attempted and :ok is returned
  when a process whose command line contains `gralkor/priv/server` is listening on port 4000
    then that process is SIGKILLed and :ok is returned
  when a process whose command line does not contain `gralkor/priv/server` is listening on port 4000
    then the function raises with the foreign command line
  (intended to run before ex-server-lifecycle's boot sequence; cleans up Gralkor's own stale uvicorn so the :port_in_use check never fires for orphans from a prior BEAM crash)
```

## TypeScript Client

```
ts-client (port contract, shared)
  when recall(group_id, session_id, query) is called
    when the backend has a memory block
      then { ok: block } is returned
    when the backend has no memory
      then { ok: null } is returned
    if the backend fails
      then { error: reason } is returned
  when capture(session_id, group_id, messages) is called
    messages is an array of canonical {role, content} objects (role ∈ "user" | "assistant" | "behaviour")
    when the backend acknowledges the capture
      then { ok: true } is returned
    if the backend fails
      then { error: reason } is returned
  when endSession(session_id) is called
    when the backend acknowledges the end
      then { ok: true } is returned
    if the backend fails
      then { error: reason } is returned
  when memorySearch(group_id, session_id, query) is called
    when the backend returns results
      then { ok: text } is returned
    if the backend fails
      then { error: reason } is returned
  when memoryAdd(group_id, content, source_description) is called
    when the backend acknowledges the add
      then { ok: true } is returned
    if the backend fails
      then { error: reason } is returned
  when healthCheck() is called
    when the backend is healthy
      then { ok: true } is returned
    if the backend fails
      then { error: reason } is returned
  when buildIndices() is called
    when the backend acknowledges the rebuild
      then { ok: { status } } is returned
    if the backend fails
      then { error: reason } is returned
  when buildCommunities(group_id) is called
    when the backend returns counts
      then { ok: { communities, edges } } is returned
    if the backend fails
      then { error: reason } is returned
ts-sanitize-group-id
  when the id contains hyphens
    then hyphens are replaced with underscores
  when the id has consecutive hyphens
    then each hyphen is replaced independently
  when the id has no hyphens
    then it is returned unchanged
ts-client-http
  then no Authorization header is attached to any request
  if Gralkor responds with a non-2xx status
    then { error: { kind: "http_status", status, body } } is returned
  if session_id is blank on recall/capture/memorySearch/endSession
    then the call throws (Gralkor requires a non-blank session_id)
  then automatic retries are disabled — every failure surfaces on the first attempt (matches the Elixir adapter's retry: false)
  then per-endpoint timeouts are applied: /health 2s, /recall + /capture + /session_end + /tools/memory_search 5s/5s/5s/10s, /tools/memory_add 60s
  runs the shared ts-client port contract (via test/contract/gralkor-client.contract.ts)
ts-client-in-memory
  when an operation is called
    then the call is recorded with its arguments for later inspection
  if no response is configured for an operation
    then { error: "not_configured" } is returned
  when reset() is called
    then configured responses and recorded calls are cleared
  runs the shared ts-client port contract (via test/contract/gralkor-client.contract.ts)
ts-connection
  when waitForHealth(client, opts) is called
    then client.healthCheck() is polled until it resolves ok or the timeout elapses
    if the backend does not respond healthy within the timeout
      then the promise rejects so the caller can decide whether to retry or fail
  after ready
    then no further polling is scheduled — runtime outages surface on the next actual call
```

## Functional Journey

```
jido-memory-journey (Elixir-driven functional suite in ex/test/functional/)
  prerequisites
    given a real Python server booted by Gralkor.Server with real Graphiti + falkordblite + Gemini
    when GOOGLE_API_KEY is unset
      then the suite is skipped
  round-trip
    given POST /tools/memory_add stores "Eli prefers concise explanations" under group "jido-test"
      when POST /recall is called with a fresh session_id and a related query
        then memory_block is a non-empty <gralkor-memory> block
        and the block references the stored content semantically (contains "concise" or similar)
  capture idle flush
    given capture_idle_seconds is short (e.g. 3s)
      when POST /capture is called with {session_id, group_id, turn}
        and idle_seconds elapses
          then the episode is ingested into the bound group_id
          and POST /search finds an edge mentioning the turn content
  session_end flush
    given a pending turn in the capture buffer (no idle elapsed)
      when POST /session_end is called with the session_id
        then 204 is returned before the episode is ingested
        and the episode lands in the bound group_id without waiting for the idle window
        and POST /search finds an edge mentioning the turn content
  graceful-shutdown flush
    given a pending turn in the capture buffer (no idle elapsed)
      when GenServer.stop(Gralkor.Server) runs
        then terminate/2 sends SIGTERM to the Python process
        and uvicorn runs lifespan shutdown which awaits flush_all
        and the episode lands before SIGKILL fires
      when the supervisor is started again
        then POST /search finds the previously-flushed episode
  crash recovery
    when the Python OS pid is killed externally (SIGKILL)
      then the GenServer stops with {:python_exited, _}
      and the supervisor restarts it
      and GET /health returns 200 within the next boot window
```

## Distribution

```
publish-ex-version-integrity
  when publish succeeds
    then @version is bumped in ex/mix.exs
    and a git tag gralkor-ex-v${version} is created for the new version (push manually)
  when not logged in to Hex
    then exits before version bump
    and no rollback is needed
  when publish fails (mix hex.publish reject)
    then @version in ex/mix.exs is rolled back to its pre-publish value
    and no git tag is created
  when successive publishes fail
    then @version does not increment multiple times
  when DRY_RUN is set
    then @version is bumped in ex/mix.exs
    and publish is skipped
    and no git tag is created
  when level is current
    then @version is not incremented
    and publish still runs
    and a git tag gralkor-ex-v${version} is created for the current version
  when level is current and publish fails
    then no rollback runs
    and ex/mix.exs remains unchanged
```
