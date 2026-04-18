# Test Trees — Gralkor

These trees are the contract between intent and implementation. Each top-level name is a behaviour; nested `when`/`then` clauses are the spec. Tests in `src/*.test.ts`, `test/integration/`, `test/functional/`, and `server/tests/` mirror these one-to-one.

Never modify silently. If implementation has drifted, decide explicitly: update the trees (and tests) to match, or pare the implementation back.

## Recall

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
  for server-side endpoints (POST /recall and POST /tools/memory_search)
    then conversation messages are looked up by session_id from the server's CaptureBuffer
    when no turns have been captured for the session
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
POST /recall endpoint
  request shape
    then body is {session_id, group_id, query, max_results}
    then requires bearer auth
    then group_id is sanitized (hyphens → underscores) before use
    then driver is routed to target graph (_ensure_driver_graph) before search
  conversation context
    then messages are sourced from capture_buffer.turns_for(session_id)
    then each buffered Turn contributes a "user" message (user_query) and an "assistant" message (assistant_answer)
    then events on the Turn are not included (they are distilled at flush time, not raw conversation)
    when the session has no entry in capture_buffer
      then interpretation runs with an empty conversation context (no error)
    when two sessions share a group_id
      then each session's recall sees only its own buffered turns
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
  when buffered turns contain <gralkor-memory> XML
    then XML is stripped via strip_gralkor_memory_xml before interpret_facts runs
  when search is called concurrently for different group_ids
    then _driver_lock serializes the calls
  when autoRecall.maxResults config is set
    then at most that many facts are returned (default 10)
interpret-facts (Python)
  when llm_client is None
    then raises (fail-fast; no fallback)
  when llm_client returns empty or whitespace response
    then raises
  when conversation history fits within token budget
    then all messages passed to LLM with formatted facts
  when conversation history exceeds token budget (250_000 chars)
    then oldest messages are dropped until context fits
    and most recent messages are always preserved
  then uses INTERPRET_SYSTEM_PROMPT
  then passes response_model with a single "text" field to generate_response
  then returns the trimmed .text field from the response dict
message-clean (Python)
  strip_gralkor_memory_xml
    when text contains <gralkor-memory>...</gralkor-memory>
      then block is removed (including nested content)
    when text has no gralkor-memory block
      then text is returned unchanged
    when text has multiple gralkor-memory blocks
      then all are removed
  SYSTEM_MESSAGE_PATTERNS (is_system_line)
    then matches "A new session was started..."
    then matches "Current time:..." (case insensitive)
    then matches "✅ New session started..." (with or without emoji)
    then matches "System: [timestamp] ..." event lines
    then matches "[User sent media without caption]"
  SYSTEM_MESSAGE_MULTILINE_PATTERNS
    then matches file-naming slug prompt ("Based on this conversation, generate a short N-N word filename slug...Reply with ONLY the slug")
  clean_user_message_text
    when message matches a SYSTEM_MESSAGE_MULTILINE_PATTERNS entry
      then returns empty string (message dropped) — early-out
    when message contains "(untrusted metadata)" block
      then block stripped, surrounding user content preserved
    when message contains "(untrusted, for context)" reply-context block
      then block stripped, surrounding user content preserved
    when message contains <gralkor-memory> XML
      then XML removed via strip_gralkor_memory_xml
    when message contains "Untrusted context (metadata...)" footer block
      then entire footer block stripped
    when message contains system lines mixed with user content
      then system lines stripped per-line via is_system_line
      and real user content preserved
    when message is entirely system content
      then returns empty string
  build_interpretation_context
    then cleans each message via clean_user_message_text
    then drops messages with empty cleaned text
    then assembles context as "Conversation context:\n{messages}\n\nMemory facts:\n{facts}"
    when total char length exceeds budget
      then oldest messages are dropped until context fits
```

## Capture

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
        then text blocks have gralkor-memory XML stripped via stripGralkorMemoryXml
        and text blocks checked individually via isSystemMessage, system blocks dropped
        and thinking blocks extracted (type "thinking")
        and tool call blocks (toolCall/toolUse/functionCall) serialized as tool_use
      when role is "toolResult"
        then gralkor-memory XML stripped via stripGralkorMemoryXml
        and converted to assistant message with tool_result block
        and text truncated to 1000 chars
      when role is "tool" (Ollama adapter)
        then treated same as "toolResult" (including gralkor-memory stripping)
      when role is "compactionSummary" or unknown
        then silently dropped
  cleanUserMessageText
    when message matches a SYSTEM_MESSAGE_MULTILINE_PATTERNS entry (whole-message system template)
      then returns empty string (message dropped) — early-out before per-step cleaning
    when message contains (untrusted metadata) JSON block
      then block stripped, surrounding user content preserved
    when message contains (untrusted, for context) reply-context JSON block
      then block stripped, surrounding user content preserved
    when message contains <gralkor-memory> XML
      then XML removed via stripGralkorMemoryXml (feedback loop prevention)
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
  SYSTEM_MESSAGE_MULTILINE_PATTERNS (whole-message system templates)
    then matches file-naming slug prompt from external plugins ("Based on this conversation, generate a short N-N word filename slug...Reply with ONLY the slug")
    then checked as early-out in cleanUserMessageText before per-step cleaning
    then exported: SYSTEM_MESSAGE_PATTERNS, isSystemMessage, isSystemLine, cleanUserMessageText, stripGralkorMemoryXml (internal)
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
      and the distill input includes the user message and the agent's response alongside the behaviour blocks for context
      and the system prompt instructs the LLM to capture dead ends and intermediary steps, not just the final response
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
POST /distill endpoint
  request shape
    then body is {turns: [{user_query, events: [...], assistant_answer}]}
    then events is a list of arbitrary shapes — no schema enforcement; the distill pipeline JSON-serialises them into the LLM prompt (inference tolerates loose input)
    then requires bearer auth
  then calls format_transcript(turns, graphiti.llm_client)
  then response is {"episode_body": string}
  when multiple turns have events
    then distillation runs in parallel (asyncio.gather)
  when a single turn's distillation raises
    then that turn's behaviour is silently dropped (empty string)
    and surrounding turns still produce output
  when a turn's user_query contains <gralkor-memory> XML
    then distilled behaviour does not echo the recalled data
POST /capture endpoint
  request shape
    then body is {session_id, group_id, turn: {user_query, events, assistant_answer}}
    then events is a list of arbitrary shapes (same as /distill)
    then requires bearer auth
  then appends turn to capture_buffer keyed by session_id (group_id is sanitized and bound to the entry on first append)
  then returns 204 No Content (no body)
  then returns immediately (does not call distill synchronously)
  when idle_seconds elapses after the last append
    then flush is triggered via the registered callback, routed to the bound group_id
capture-buffer (Python)
  append
    when called for a new session_id
      then entry created bound to the supplied group_id and the turn
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
      then returns them in append order
    when the session has never been appended to (or was just flushed)
      then returns an empty list
  flush on idle
    when idle_seconds elapses
      then flush_callback is invoked with (group_id, list_of_turns) derived from the entry
      and the entry is removed from the buffer
      and subsequent turns_for(session_id) calls return []
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
turns_to_conversation (Python)
  when a turn has a user_query
    then emits a ConversationMessage(role="user", text=user_query)
  when a turn has an assistant_answer
    then emits a ConversationMessage(role="assistant", text=assistant_answer)
  when a turn has empty strings for either field
    then that field contributes no message
  then events on the turn never become ConversationMessages (they are distilled, not raw conversation)
format-transcript (Python)
  inputs
    then takes a list[Turn] directly (no EpisodeMessage/EpisodeBlock intermediate)
    then Turn.events is list[Any] — loose shapes: dicts, strings, nested content
  event rendering
    when event is a string
      then it's used verbatim (trimmed)
    when event is a dict or nested structure
      then it's JSON-serialised for the distill prompt (default=str, ensure_ascii=False)
    when events contain unfamiliar fields (e.g. ReAct's :llm_completed, :tool_started)
      then they're still passed through — the distill LLM reasons over the raw shape
  transcript
    when turn has events and llm_client available
      then events are joined with "\n---\n" as the "Actions:" section
      and distill input includes user message and assistant response for context
      and system prompt instructs capturing dead ends and intermediary steps
      and distilled via llm_client into first-person past-tense summary
      and rendered as "Assistant: (behaviour: {summary})" before assistant text
    when events reference recalled memory
      then distillation describes intent ("consulted memory") and does NOT echo recalled fact content
    when distillation fails for a turn (safe_distill)
      then behaviour line silently dropped, assistant text preserved
    when llm_client is None
      then events silently omitted, user/assistant text preserved
    when turn has no events
      then rendered as "User: ...\nAssistant: ..." with no behaviour line, no LLM call
    then passes response_model with a single "behaviour" field to generate_response
    then parallel distillation across turns via asyncio.gather
```

## Tools

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
POST /tools/memory_search endpoint
  request shape
    then body is {session_id, group_id, query, max_results, max_entity_results}
    then requires bearer auth
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
  when buffered turns contain <gralkor-memory> XML
    then XML is stripped before interpret_facts runs
  when search is called concurrently for different group_ids
    then _driver_lock serializes the calls
POST /tools/memory_add endpoint
  request shape
    then body is {group_id, content, source_description?}
    then requires bearer auth
  then auto-generates name ("manual-add-" + timestamp_ms)
  then auto-generates idempotency_key (uuid4)
  then calls graphiti.add_episode with source=EpisodeType.text under _driver_lock
  then group_id is sanitized before ingestion
  then passes current ontology (entity_types, edge_types, edge_type_map)
  then response is {"status": "stored"}
  when source_description is omitted
    then defaults to "manual"
```

## Startup

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
multi-load resilience
  when plugin is loaded multiple times (as OpenClaw does)
    and the first instance's service resolves the ReadyGate
      then a second instance's auto-recall handler still searches the graph
      then a second instance's memory_add tool does not throw
    and no instance has resolved the ReadyGate
      then auto-recall handler throws (fail-fast)
      then memory_add tool throws (fail-fast)
ex-server-lifecycle (Elixir supervisor in ex/)
  init
    when init returns
      then it never blocks (handle_continue(:boot) runs the slow work)
  boot sequence
    when handle_continue(:boot) runs
      then Gralkor.Config.write_yaml writes config.yaml at $GRALKOR_DATA_DIR/config.yaml
      then Port.open spawns "uv run uvicorn main:app --host 127.0.0.1 --port 4000 --timeout-graceful-shutdown 30" with cd: server_dir
      then env vars are forwarded: AUTH_TOKEN, GOOGLE_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, GROQ_API_KEY, FALKORDB_DATA_DIR, CONFIG_PATH
      then Gralkor.Health.check(/health) polls at 500ms intervals until 200 or the configured boot_timeout_ms (default 120_000)
    when the deadline passes with no healthy response
      then stops with {:boot_failed, :boot_timeout} (supervisor restart)
    when the spawned port exits during boot
      then the boot loop peeks the mailbox each iteration and fails fast
      then stops with {:boot_failed, :port_exited} (no full-timeout wait)
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
    when GRALKOR_DATA_DIR is missing
      then raises (fail-fast)
    when GRALKOR_AUTH_TOKEN is missing
      then raises
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
sanitizeGroupId
  when agentId contains hyphens
    then hyphens are replaced with underscores
  when agentId has no hyphens
    then returned unchanged
  then applied exactly once: at the setSessionData write boundary in index.ts
  then all readers (tools, auto-recall, flush) get the pre-sanitized value from the map
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
auth
  when AUTH_TOKEN env var is unset
    then all endpoints accept requests without an Authorization header (local-dev bypass)
  when AUTH_TOKEN env var is set
    when Authorization header is missing
      then protected endpoints return 401
    when Authorization header has a non-Bearer scheme
      then protected endpoints return 401
    when Authorization is "Bearer <wrong-token>"
      then protected endpoints return 401
    when Authorization is "Bearer <correct-token>"
      then protected endpoints proceed normally
    when GET /health is called
      then /health is exempt (accepts requests with or without auth)
```

## Functional Journey

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
