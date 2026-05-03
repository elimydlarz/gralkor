# Test Trees — Gralkor

These trees are the contract between intent and implementation. Each top-level name is a behaviour; nested `when`/`then` clauses are the spec. Tests in `ex/test/`, `ts/test/`, and `server/tests/` mirror these one-to-one.

Never modify silently. If implementation has drifted, decide explicitly: update the trees (and tests) to match, or pare the implementation back.

## ts/ vs ex/ split

`gralkor/server/` is the Python FastAPI server. It is consumed only by `@susu-eng/gralkor-ts`, which spawns it as a managed child (or talks to an external one via `EXTERNAL_GRALKOR_URL`). Server-side trees in this file (`POST /…`, `capture-buffer`, `format-transcript`, `interpret-facts`, `_graphiti_for`, `server-warmup-on-boot`, `cross-encoder-selection`, `server-config-defaults`, `rate-limit-retry`, `downstream-error-handling`, `/health endpoint`, `upstream-idle-survival`) describe that server. `ts-…` trees describe the TS adapter.

`:gralkor_ex` does not use the Python server. It embeds CPython in the BEAM via [PythonX](https://github.com/livebook-dev/pythonx) and drives `graphiti-core` directly. Logic that lives in the server's pipelines (capture buffer, distill, interpret, recall composition, tools) is duplicated in Elixir under `ex/lib/gralkor/`. LLM calls go through [`req_llm`](https://github.com/agentjido/req_llm), which abstracts providers; trees say "the configured LLM" rather than naming providers. `ex-…` trees describe the Elixir adapter.

The two stacks satisfy the same consumer-visible contract (`Gralkor.Client` / `GralkorClient`), enforced by their respective shared port-contract suites — *modulo* surface area that only made sense over HTTP. The ex stack has no `health_check`, no readiness gate, no `EXTERNAL_…_URL` mode, no transport-error class, no per-endpoint receive windows: by the time `Application.start/2` returns, the embedded runtime is ready, and runtime failures surface as supervisor restarts.

## Canonical turn shape

```
canonical-message (shared)
  a captured turn is a list of messages with:
    role ∈ {"user", "assistant", "behaviour"}
    content: str (opaque — adapters render harness-internal events however they like)
  the pipeline (server-side or ex-side) never branches on content interior structure — only on
    role (for distillation labels and interpretation context). Anything to strip or rewrite
    (gralkor-memory envelopes, system-line artefacts, etc.) is an adapter concern and lives
    in the harness's adapter, not here.
```

## Recall

```
recall-interpretation (ts stack; functional: server/tests/test_recall.py)
  when relevant facts are found
    then memory_block lists them, one per line
    and each entry is the original fact verbatim (preserving every timestamp
      parenthetical: '(created …)', '(valid from …)', '(invalid since …)',
      '(expired …)') followed by ' — ' and a one-sentence relevance reason
  when no relevant facts are found
    then memory_block is "No relevant memories found."
POST /recall endpoint (ts stack; src: server/main.py; unit: server/tests/test_recall.py)
  request shape
    when the request body includes a non-blank session_id
      then body is {session_id, group_id, query, …}
    when the request body omits session_id
      then body is {group_id, query, …}
    when the request body includes max_results
      then at most that many facts are returned
    when the request body omits max_results
      then the server applies its default (10)
    then group_id is sanitized (hyphens → underscores) before use
  if the request body includes a blank session_id
    then 422 is returned (Gralkor requires session_id to be a non-blank string or absent)
  conversation context
    when the request body includes a non-blank session_id and capture_buffer has an entry for it
      then messages are sourced from capture_buffer.turns_for(session_id), flat-walked
      and every Message in every buffered turn is included in order, with its role label
    when the request body includes a non-blank session_id but capture_buffer has no entry for it
      then interpretation runs with an empty conversation context (no error)
    when the request body omits session_id
      then interpretation runs with an empty conversation context (no error)
      and capture_buffer is not consulted
    when two sessions share a group_id
      then each session's recall sees only its own buffered turns
    then the server never strips or rewrites Message content — adapters hand in clean strings
  when called
    then graphiti.search runs against the sanitized group_id
      when search returns no facts
        then memory_block body is "No relevant memories found."
      when search returns facts
        then interpret_facts is called with the session's buffered conversation and the formatted facts
          when interpret_facts returns relevant facts
            then memory_block body is the list of relevant facts
          when interpret_facts returns []
            then memory_block body is "No relevant memories found."
    and memory_block wraps body in <gralkor-memory trust="untrusted">...</gralkor-memory>
    and memory_block includes the further-querying instruction
  /recall deadline
    then /recall completes within a bounded time budget
    if the budget is exhausted before the handler returns
      then in-flight upstream work is cancelled
      and the response is 504 with {"error": "recall deadline expired"}
  observability
    then logs "[gralkor] recall — session:… group:… queryChars:… max:…" at INFO on every call
    then logs "[gralkor] recall result — <N> facts blockChars:… <ms> (search:… interpret:…)" at INFO on every call
      and interpret:… is 0 when interpret_facts was not called (empty facts)
    when test mode is enabled (logger level DEBUG)
      then also logs "[gralkor] [test] recall query: <raw query>" at DEBUG
      and when facts are returned also logs "[gralkor] [test] recall block: <memory block>" at DEBUG
interpret-facts (ts stack; src: server/pipelines/interpret.py; unit: server/tests/test_interpret.py)
  calls llm_client with conversation messages (within char budget) and formatted facts
    and the response_model (InterpretResult.relevantFacts) carries a Field
      description instructing the LLM to copy each fact line verbatim
      (preserving every timestamp parenthetical, dropping the leading '- ')
      then ' — ' then a one-sentence relevance reason
    when the LLM returns relevant facts
      then returns the list unchanged (one entry per fact: verbatim original
        fact with timestamps + ' — ' + relevance reason)
    when the LLM returns an empty list
      then returns []
    when the LLM response is malformed
      then raises
  when llm_client is None
    then raises
build_interpretation_context (ts stack; src: server/pipelines/interpret.py; unit: server/tests/test_interpret.py)
  then labels each message by role: "User", "Assistant", "Agent did" (for behaviour)
  then drops messages with empty cleaned content
  then assembles context as "Conversation context:\n{messages}\n\nMemory facts to interpret:\n{facts}"
  when total char length exceeds budget
    then oldest messages are dropped until context fits
  then does NOT inspect or mutate content beyond whitespace trimming (no XML stripping,
    no system-line filtering — those are adapter concerns)
ex-recall (ex stack; src: ex/lib/gralkor/recall.ex; unit: ex/test/gralkor/recall_test.exs)
  when relevant facts are found
    then memory_block lists them, one per line
    and each entry is the original fact verbatim (preserving every timestamp
      parenthetical) followed by ' — ' and a one-sentence relevance reason
  when no relevant facts are found
    then memory_block body is "No relevant memories found."
  request shape (Gralkor.Recall.recall/1 args)
    when called with a non-blank session_id
      then conversation context is sourced from Gralkor.CaptureBuffer.turns_for(session_id), flat-walked in order with role labels
    when called with a nil session_id
      then conversation context is empty
      and Gralkor.CaptureBuffer is not consulted
    when called with max_results
      then at most that many facts are searched
    when called without max_results
      then the default (10) is applied
    then group_id is sanitized (hyphens → underscores) before use
  orchestration
    when called
      then Gralkor.GraphitiPool runs search against the sanitized group_id
        when search returns no facts
          then memory_block body is "No relevant memories found."
        when search returns facts
          then Gralkor.Interpret.interpret_facts is called with the conversation and the formatted facts
            when interpret_facts returns relevant facts
              then memory_block body is the list of relevant facts
            when interpret_facts returns []
              then memory_block body is "No relevant memories found."
      and memory_block wraps body in <gralkor-memory trust="untrusted">...</gralkor-memory>
      and memory_block includes the further-querying instruction
  recall deadline
    then recall completes within 12_000ms (matches the consumer's worst-case tolerance — see Susu2.ChatAgent)
    if the budget is exhausted before the call returns
      then in-flight upstream work is cancelled
      and {:error, :recall_deadline_expired} is returned
  observability
    then logs "[gralkor] recall — session:… group:… queryChars:… max:…" at :info on every call
    then logs "[gralkor] recall result — <N> facts blockChars:… <ms> (search:… interpret:…)" at :info on every call
      and interpret:… is 0 when interpret_facts was not called (empty facts)
  (rate-limit / transient upstream errors: req_llm owns the retry. ex layer adds nothing.)
ex-interpret (ex stack; src: ex/lib/gralkor/interpret.ex; unit: ex/test/gralkor/interpret_test.exs)
  interpret_facts/2 calls the configured LLM (via req_llm) with conversation messages (within char budget) and formatted facts
    and the structured-output schema instructs the LLM to copy each fact line verbatim
      (preserving every timestamp parenthetical, dropping the leading '- ')
      then ' — ' then a one-sentence relevance reason
    when the LLM returns relevant facts
      then returns the list unchanged
    when the LLM returns an empty list
      then returns []
    if the LLM response is malformed
      then raises
ex-format-fact (ex stack; src: ex/lib/gralkor/format.ex; unit: ex/test/gralkor/format_test.exs)
  Gralkor.Format.format_fact/1 takes a map with :fact (required) and optional :created_at, :valid_at, :invalid_at, :expired_at timestamp strings
    then returns "- {fact}" with each present timestamp appended in parentheses in this order: "(created …)", "(valid from …)", "(invalid since …)", "(expired …)"
  Gralkor.Format.format_timestamp/1 takes an ISO-8601 timestamp string
    then strips fractional seconds
    then converts a trailing "Z" to "+0"
    then compacts a "+HH:00" / "-HH:00" zone offset to "+H" / "-H" (single-digit hour, no minutes when 00); a non-zero minute offset is preserved as "+H:MM" / "-H:MM"
  Gralkor.Format.format_facts/1 takes a list of fact maps
    when the list is empty
      then returns ""
    when the list has facts
      then joins format_fact/1 results with newlines (no leading "Facts:" header — Recall composes the surrounding context)
ex-interpret-context (ex stack; src: ex/lib/gralkor/interpret.ex; unit: ex/test/gralkor/interpret_test.exs)
  build_interpretation_context/2
    then labels each message by role: "User", "Assistant", "Agent did" (for behaviour)
    then drops messages with empty cleaned content
    then assembles context as "Conversation context:\n{messages}\n\nMemory facts to interpret:\n{facts}"
    when total char length exceeds budget
      then oldest messages are dropped until context fits
    then does NOT inspect or mutate content beyond whitespace trimming
```

## Capture

```
POST /distill endpoint (ts stack; src: server/main.py; unit: server/tests/test_distill_endpoint.py)
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
POST /capture endpoint (ts stack; src: server/main.py; unit: server/tests/test_capture_endpoint.py; integration: server/tests/test_capture_flush_integration.py)
  request shape
    then body is {session_id, group_id, messages: [{role, content}, …]}
    then role ∈ {"user", "assistant", "behaviour"}; content is a string the adapter produced
  if session_id is missing or blank
    then 422 is returned (Gralkor requires a non-blank session_id)
  then appends the message list to capture_buffer keyed by session_id (group_id is sanitized
    and bound to the entry on first append)
  then returns 204 No Content (no body)
  then returns immediately (does not call distill synchronously)
  observability
    when test mode is enabled (logger level DEBUG)
      then logs "[gralkor] [test] capture messages: [(role, content), …]" at DEBUG
  flush (_capture_flush in main.py — fires from /session_end and lifespan shutdown only)
    when the distilled episode body is empty
      then does not call add_episode (no log)
    when the episode is added
      then logs "[gralkor] capture flushed — group:… uuid:… bodyChars:… <ms>" at INFO
    when test mode is enabled
      then also logs "[gralkor] [test] capture flush body: <episode_body>" at DEBUG
POST /session_end endpoint (ts stack; src: server/main.py; unit: server/tests/test_session_end_endpoint.py)
  request shape
    then body is {session_id}
  when called for a session_id with buffered turns
    then the session's buffered turns are flushed via the registered callback and retry machinery
    and 204 No Content is returned without awaiting the flush completion
  when called for a session_id with no buffered turns
    then 204 No Content is returned and no flush is scheduled
  if session_id is missing or blank
    then 422 is returned
  observability
    then logs "[gralkor] session_end session:… turns:N" at INFO
capture-buffer (ts stack; src: server/pipelines/capture_buffer.py; unit: server/tests/test_capture_buffer.py)
  the buffer holds turns until an explicit flush — session lifetime is owned by the consumer
  (see susu-2's ChatAgent terminate hook); the server has no idle-flush policy
  append
    when called for a new session_id
      then an entry is created bound to the supplied group_id and the turn (list of Messages)
    when called again for the same session_id
      then the new turn is appended to the existing entry and prior turns remain buffered
    when called for multiple session_ids
      then each session_id has an independent entry
    when called for an existing session_id with a different group_id
      then raises (sessions are not re-bindable across groups)
  turns_for(session_id)
    when the session has buffered turns
      then returns list[list[Message]] in append order — each turn is a list of Messages
    when the session has never been appended to (or was just flushed)
      then returns an empty list
  flush(session_id)
    when called for a session_id with buffered turns
      then flush_callback is scheduled with (group_id, list[list[Message]]) derived from the entry
      and the call returns without awaiting the scheduled flush
      and the entry is removed from the buffer
      and subsequent turns_for(session_id) calls return []
    when called for a session_id with no entry
      then returns without scheduling any flush
  retry schedule
    buffer retries only for failure classes it owns — see Retry ownership
    when flush_callback raises a 4xx CaptureClientError
      then does not retry and logs "capture dropped (4xx)" (contract error — non-retryable)
    when flush_callback raises an upstream-LLM error
      then does not retry and logs "capture dropped (upstream error)" — retrying at this layer would amplify load on an already-struggling upstream
    when flush_callback raises any other Exception (server-internal: graph write failure, Falkor driver error, internal distill crash)
      then retries at 1s, 2s, 4s (exponential)
    when flush_callback raises a server-internal error after 3 retries
      then logs "capture exhausted" and drops
  flush_all
    when called with pending entries
      then every entry is flushed via the same callback and retry machinery and awaited
    when called with no entries
      then returns immediately
    when one flush fails and another succeeds
      then the successful flush still completes
  lifespan shutdown
    when FastAPI lifespan enters shutdown
      then capture_buffer.flush_all is awaited
format-transcript (ts stack; src: server/pipelines/distill.py; unit: server/tests/test_distill.py)
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
ex-capture-buffer (ex stack; src: ex/lib/gralkor/capture_buffer.ex; unit: ex/test/gralkor/capture_buffer_test.exs)
  the buffer holds turns until an explicit flush — session lifetime is owned by the consumer;
  there is no idle-flush policy
  append/3 (session_id, group_id, messages)
    when called for a new session_id
      then an entry is created bound to the sanitized group_id and the turn (list of Messages)
    when called again for the same session_id
      then the new turn is appended to the existing entry and prior turns remain buffered
    when called for multiple session_ids
      then each session_id has an independent entry
    when called for an existing session_id with a different group_id
      then raises (sessions are not re-bindable across groups)
  turns_for/1
    when the session has buffered turns
      then returns [[Gralkor.Message.t()]] in append order
    when the session has never been appended to (or was just flushed)
      then returns []
  flush/1 (session_id)
    when called for a session_id with buffered turns
      then the flush callback is scheduled with (group_id, [[Message]]) derived from the entry
      and the call returns without awaiting the scheduled flush
      and the entry is removed from the buffer
      and subsequent turns_for/1 calls return []
    when called for a session_id with no entry
      then returns without scheduling any flush
  retry schedule (owns the server-internal failure class — see Retry ownership)
    when the flush callback returns {:error, :capture_client_4xx}
      then does not retry and logs "capture dropped (4xx)" at :warning
    when the flush callback returns {:error, {:upstream_llm, _}}
      then does not retry and logs "capture dropped (upstream error)" at :warning
    when the flush callback raises or returns {:error, _} for any other reason (graph write failure, GraphitiPool error, internal distill crash)
      then retries at 1s, 2s, 4s (exponential)
    when the flush callback fails after 3 retries
      then logs "capture exhausted" at :error and drops
  flush_all/0
    when called with pending entries
      then every entry is flushed via the same callback and retry machinery and awaited
    when called with no entries
      then returns immediately
    when one flush fails and another succeeds
      then the successful flush still completes
  application shutdown
    when the supervision tree is stopping
      then Gralkor.CaptureBuffer.terminate/2 awaits flush_all/0 before exit
ex-format-transcript (ex stack; src: ex/lib/gralkor/distill.ex; unit: ex/test/gralkor/distill_test.exs)
  format_transcript/1 takes [[Gralkor.Message.t()]] — each turn is a list of canonical Messages
  per turn
    when a turn contains a message with role="behaviour"
      then all messages in the turn are rendered with role labels ("User: …", "Agent did: …",
        "Assistant: …") and passed to the configured LLM (via req_llm) as the "thinking" prompt
    when a turn has no behaviour messages
      then distillation is skipped for that turn (no LLM call)
  transcript rendering
    when a turn has behaviour and the LLM call succeeds
      then it is distilled into a first-person past-tense summary
      and rendered as "Assistant: (behaviour: {summary})" before the assistant text for that turn
    when distillation fails for a turn (safe_distill/1)
      then the behaviour line is silently dropped, user/assistant text preserved
    when no LLM is configured
      then behaviour lines are silently omitted, user/assistant text preserved
    when a turn has no behaviour
      then rendered as "User: …\nAssistant: …" with no behaviour line, no LLM call
  then the LLM call uses a structured-output schema with a single "behaviour" field
  then turns with behaviour are distilled in parallel via Task.async_stream
ex-capture (ex stack; src: ex/lib/gralkor/client/native.ex#capture/3; unit: ex/test/gralkor/client/native_test.exs)
  request shape
    when called with session_id, group_id, messages (a list of Gralkor.Message structs)
      then group_id is sanitized
      and Gralkor.CaptureBuffer.append/3 is invoked with the sanitized group_id and the messages
  if session_id is missing or blank
    then raises ArgumentError
  then returns :ok immediately (does not call distill synchronously)
  observability
    when test mode is enabled (logger level :debug)
      then logs "[gralkor] [test] capture messages: [(role, content), …]" at :debug
  flush (Gralkor.CaptureBuffer's flush callback — fires from end_session/1 and shutdown only)
    when the distilled episode body is empty
      then does not call GraphitiPool.add_episode (no log)
    when the episode is added
      then logs "[gralkor] capture flushed — group:… uuid:… bodyChars:… <ms>" at :info
    when test mode is enabled
      then also logs "[gralkor] [test] capture flush body: <episode_body>" at :debug
ex-end-session (ex stack; src: ex/lib/gralkor/client/native.ex#end_session/1; unit: ex/test/gralkor/client/native_test.exs)
  when called with a session_id with buffered turns
    then Gralkor.CaptureBuffer.flush/1 is invoked
    and :ok is returned without awaiting the flush completion
  when called with a session_id with no buffered turns
    then :ok is returned and no flush is scheduled
  if session_id is missing or blank
    then raises ArgumentError
  observability
    then logs "[gralkor] session_end session:… turns:N" at :info
```

## Tools

The only graph-read endpoint on the server is `POST /recall`; harness manual-search tools call it directly. The ex stack mirrors this — the only graph read is `Gralkor.Client.recall/3`.

```
POST /tools/memory_add endpoint (ts stack; src: server/main.py; unit: server/tests/test_tools.py)
  request shape
    then body is {group_id, content, source_description?}
  then auto-generates name ("manual-add-" + timestamp_ms)
  then auto-generates idempotency_key (uuid4)
  then calls graphiti.add_episode with source=EpisodeType.text on a Graphiti scoped to the sanitized group_id
  then group_id is sanitized before ingestion
  then passes current ontology (entity_types, edge_types, edge_type_map)
  then response is {"status": "stored"}
  when source_description is omitted
    then defaults to "manual"
POST /build-indices endpoint (ts stack; src: server/main.py; unit: server/tests/test_tools.py)
  request shape
    then body is {} (no arguments — the operation runs across the whole graph, not a specific group)
  then calls graphiti.build_indices_and_constraints()
  then response is {"status": string}
  (admin-only — the adapter libraries expose this as an explicit call; consumer harnesses guard invocation with DO-NOT-CALL-UNLESS-ASKED semantics)
POST /build-communities endpoint (ts stack; src: server/main.py; unit: server/tests/test_tools.py)
  request shape
    then body is {group_id}
    then group_id is sanitized before use
  then calls graphiti.build_communities on a Graphiti scoped to the sanitized group_id
  then response is {"communities": non_neg_integer, "edges": non_neg_integer} with the counts produced
  (admin-only — expensive per-group operation; harness-level DO-NOT-CALL guards apply)
ex-memory-add (ex stack; src: ex/lib/gralkor/client/native.ex#memory_add/3; unit: ex/test/gralkor/client/native_test.exs)
  request shape
    when called with group_id, content, source_description
      then group_id is sanitized before ingestion
  then auto-generates name ("manual-add-" + timestamp_ms)
  then auto-generates idempotency_key (UUID v4)
  then calls Gralkor.GraphitiPool.add_episode with source=:text scoped to the sanitized group_id
  then passes current ontology (entity_types, edge_types, edge_type_map)
  then returns {:ok, %{status: "stored"}}
  when source_description is omitted (nil)
    then defaults to "manual"
ex-build-indices (ex stack; src: ex/lib/gralkor/client/native.ex#build_indices/0; unit: ex/test/gralkor/client/native_test.exs)
  then calls Gralkor.GraphitiPool.build_indices_and_constraints (operates on the whole graph)
  then returns {:ok, %{status: String.t()}}
  (admin-only — DO-NOT-CALL-UNLESS-ASKED semantics, same as ts stack)
ex-build-communities (ex stack; src: ex/lib/gralkor/client/native.ex#build_communities/1; unit: ex/test/gralkor/client/native_test.exs)
  request shape
    when called with group_id
      then group_id is sanitized before use
  then calls Gralkor.GraphitiPool.build_communities scoped to the sanitized group_id
  then returns {:ok, %{communities: non_neg_integer(), edges: non_neg_integer()}}
  (admin-only)
```

## Startup

```
ex-application (src: ex/lib/gralkor/application.ex; unit: ex/test/gralkor/application_test.exs)
  start/2 child specs
    consumers opt into the embedded runtime by setting GRALKOR_DATA_DIR; opting in is the only path
      (no thin-client / external-URL alternative — those were dropped with the HTTP server)
    when GRALKOR_DATA_DIR is set
      then the supervisor includes (in order):
        Gralkor.Python (synchronous boot — see ex-python-runtime; reaps redislite orphans, smoke-imports graphiti_core)
        Gralkor.GraphitiPool (per-group Graphiti instances; runs warmup before init returns)
        Gralkor.CaptureBuffer (in-flight turns; flush callback distills via req_llm and ingests via GraphitiPool.add_episode)
      then Application.start/2 returns only after all three have initialised
        (consumers do not need a separate readiness gate — there is no Gralkor.Connection)
    when GRALKOR_DATA_DIR is unset
      then the supervisor includes no children
        (consumer / library has not opted in; tests start specific children via start_supervised; production sets the env var)
ex-python-runtime (src: ex/lib/gralkor/python.ex; unit: ex/test/gralkor/python_test.exs)
  Gralkor.Python's init/1 runs the boot sequence synchronously and returns only when ready
    then any process whose argv contains "redislite/bin/redis-server" is SIGKILLed
      (boot-time backstop: falkordblite — loaded into PythonX in this BEAM — spawns a redis-server grandchild that a hard BEAM SIGKILL leaves orphaned. Safe to nuke unconditionally because this runs before our own PythonX init, so anything matching is by definition not ours-yet, and `redislite/bin/redis-server` is unique-to-falkordblite with no other plausible owner.)
    then the priv/python/ uv-managed venv is materialised if absent
      (graphiti-core + falkordblite + provider deps installed; idempotent — subsequent boots noop)
    then PythonX is initialised pointing at that venv
    then a smoke import of graphiti_core succeeds
    if any step fails
      then init/1 returns {:stop, {:boot_failed, reason}} so the supervisor restarts (and the BEAM eventually exits if the failure is permanent)
  liveness
    then once booted, no health probes run — runtime failures surface from the next call into PythonX (which crashes the GenServer and triggers a supervisor restart)
ex-graphiti-pool (src: ex/lib/gralkor/graphiti_pool.ex; unit: ex/test/gralkor/graphiti_pool_test.exs)
  LLM call ownership (decided in pythonx-spike/LEARNINGS.md)
    Distill and Interpret (Elixir-side pre/post-processing) call the LLM via req_llm — see ex-format-transcript and ex-interpret
    Graphiti-internal LLM and embedding (entity/edge extraction during add_episode; embedder during search; reranker) go through graphiti-core's bundled Python clients — never req_llm — because graphiti owns those call sites and routing them through a Python↔Elixir↔HTTP shim adds two hops for no win
  Gralkor.GraphitiPool's init/1 runs synchronously
    then the FalkorDB driver (AsyncFalkorDB → FalkorDriver), the graphiti-core LLM client, the embedder, and the cross-encoder are constructed once via Pythonx and shared across all Graphiti instances in the pool
    then warmup runs: search is invoked once with a throwaway query and group_id, then Gralkor.Interpret.interpret_facts is invoked once with an empty conversation and a throwaway facts_text, paying graphiti-core's cold-start cost before consumers can call recall
    then logs "[gralkor] warmup — search:… interpret:… <total>ms" at :info
    if any warmup call raises or returns {:error, _}
      then it is caught and logged at :warning as "[gralkor] warmup failed (non-fatal): <reason>"
      and boot proceeds (best-effort — same as the ts stack's server-warmup-on-boot)
  for/1 (group_id)
    when called with a group_id for the first time
      then a Graphiti instance is constructed scoped to that group_id and cached
    when called twice with the same group_id
      then the same instance is returned both times (no re-construction)
    when called with different group_ids
      then different instances are returned
    then group_id is sanitized before construction
    then for/1 does NOT serialise calls — concurrent callers proceed in parallel (the spike showed Pythonx releases the GIL during graphiti's awaited I/O; serialising would throw away that parallelism). The GenServer owns lifecycle (init, terminate); the cache is an ETS table read directly by callers.
  no eviction (mirrors server's _graphiti_for)
    then instances live for the lifetime of the GenServer — there is no LRU or TTL
  rationale (not behaviour)
    pinning each Graphiti instance to one group_id keeps graphiti-core's add_episode driver-clone branch inert,
    so concurrent calls for the same or different groups proceed independently with no driver lock —
    same invariant as server-side _graphiti_for
ts-server-manager (ts stack; src: ts/src/server-manager.ts; unit: ts/test/server-manager.test.ts)
  bundledServerDir
    then resolves to the "server" sibling of the compiled module's directory (i.e. <pkg>/server/)
  construction
    then serverDir defaults to bundledServerDir() (the copy shipped inside @susu-eng/gralkor-ts)
    then consumers may override serverDir to point at a development checkout
    then the returned manager starts with isRunning() === false
  buildConfigYaml (helper written into config.yaml at start time)
    when neither llmConfig nor embedderConfig nor ontologyConfig nor test is supplied
      then returns the empty string — no llm/embedder section is written and the server applies its own defaults (single source of truth in server/main.py)
    when llmConfig is supplied
      then emits an "llm:" block with the passed provider + model
    when llmConfig is omitted
      then no "llm:" block is written (server fills in defaults)
    when embedderConfig is supplied
      then emits an "embedder:" block with the passed provider + model
    when embedderConfig is omitted
      then no "embedder:" block is written (server fills in defaults)
    when test is true
      then appends "test: true"
    when ontologyConfig is supplied
      then appends the serialised ontology block
  serializeOntologyYaml (helper written into config.yaml at start time)
    when the ontology has entities
      then emits an "ontology: entities:" block with description and optional attribute entries
    when the ontology has edges
      then emits an "edges:" block under ontology
    when the ontology has an edgeMap
      then emits an "edgeMap:" block with "EntityA,EntityB" keys and their edge lists
    when the ontology is empty (no entities, edges, or edgeMap)
      then emits just "ontology:\n"
  start (NOT covered by unit tests; exercised only by consumers in production)
    then before spawning, prior-run orphans are reaped
      when lsof reports any pid listening on the configured port
        then SIGTERM is sent to each pid
        and the port is polled until free (up to 5s)
        if the port is still bound after SIGTERM
          then SIGKILL is sent and the port is polled again (up to 2s)
          if still bound after SIGKILL
            then start rejects with a clear error
      when pgrep -af reports any process whose argv contains "redislite/bin/redis-server"
        then SIGKILL is sent to each pid
    then uv run uvicorn main:app is spawned with cwd = serverDir
    and env includes GOOGLE_API_KEY / ANTHROPIC / OPENAI / GROQ where supplied
    and /health is polled at 500ms intervals until 200 or the boot window expires
    if /health never returns 200 within the boot window
      then start rejects with a timeout error
  stop (NOT covered by unit tests; exercised only by consumers in production)
    then a stopping flag is set so the exit handler does not respawn
    when the spawned process is ours
      then SIGTERM is sent and we wait up to STOP_GRACE_MS for clean exit
      if the process is still running after the grace window
        then SIGKILL is sent
  child exit handling (NOT covered by unit tests; exercised only by consumers in production)
    when the spawned process emits "exit" while the stopping flag is false (unexpected death)
      then the same start path is re-run (orphan reap → spawn → health-poll)
      and the timestamp of the unexpected exit is recorded in a rolling 5s window
      if more than 3 unexpected exits land in any 5s window
        then process.exit(1) is called so the next-level supervisor (Docker restart: unless-stopped in agents/) escalates rather than livelocking on an unrecoverable child
    when the spawned process emits "exit" while the stopping flag is true
      then no respawn is attempted
ts-bundle-server (ts stack; src: ts/scripts/bundle-server.mjs; unit: ts/test/bundle-server.test.ts)
  then runs as the pre-build step (package.json's "build": "pnpm run bundle-server && tsc")
  when gralkor/server/ exists at ../server relative to ts/
    then its contents are copied into ts/server/
    and destination is wiped before copy (no stale files)
    and these paths are skipped: .venv, .pytest_cache, __pycache__, wheels, tests, mutants, tmp
    and these extensions are skipped: *.pyc
  when ../server does not exist
    then the script exits non-zero (caller must fix the path)
  then ts/server/ is gitignored (build artifact, regenerated from canonical source on every publish)
  then package.json's files: includes "server" so the bundle ships in the npm tarball
```

## Configuration

```
validateOntologyConfig (ts stack; src: ts/src/config.ts; unit: ts/test/config.test.ts)
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
server-config-defaults (ts stack; src: server/main.py; unit: server/tests/test_lifespan.py)
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
cross-encoder-selection (ts stack; src: server/main.py; unit: server/tests/test_cross_encoder.py)
  when llm provider is gemini
    then uses GeminiRerankerClient
  when llm provider is not gemini and OPENAI_API_KEY is set
    then uses OpenAIRerankerClient
  when llm provider is not gemini and OPENAI_API_KEY is not set
    then cross_encoder is None
ex-config-defaults (ex stack; src: ex/lib/gralkor/config.ex; unit: ex/test/gralkor/config_test.exs)
  when the consumer supplies an LLM provider/model
    then that provider/model is used for all LLM calls (Distill, Interpret, graphiti-core inside PythonX)
  when the consumer omits LLM provider/model
    then defaults are applied (single source of truth in Gralkor.Config) — req_llm picks the provider; the embedder and cross-encoder defaults match the server-side ts stack so the two stacks remain interchangeable from a consumer's POV
  (the trees below this layer say "the configured LLM" — they do not branch on provider, so adding/removing providers does not ripple into other trees)
```

## Operations

```
/health endpoint (ts stack; src: server/main.py)
  then responds in constant time — independent of graph size (no MATCH, no counts)
  when the FalkorDB driver answers a cheap probe
    then returns 200
  if the probe raises or times out
    then returns 503 with an error detail
rate-limit-retry (ts stack; src: server/main.py; unit: server/tests/test_recall.py)
  server side
    when upstream LLM returns a rate-limit error
      then 429 response includes Retry-After header
    (client-side retry handling is not part of @susu-eng/gralkor-ts — the adapter surfaces the 429 as an error and lets consumers decide; see consumer-owned retry logic in @susu-eng/openclaw-gralkor if needed)
_graphiti_for (ts stack; src: server/main.py; unit: server/tests/test_graphiti_for.py)
  when called with a group_id
    then returns a Graphiti scoped to that group_id
  when called twice with the same group_id
    then returns the same instance both times
  when called with different group_ids
    then returns different instances
downstream-error-handling (ts stack; src: server/main.py; unit: server/tests/test_downstream_error_handling.py)
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
server-warmup-on-boot (ts stack; src: server/main.py; unit: server/tests/test_lifespan.py)
  during lifespan startup, after the index check and before yielding to accept traffic
    then graphiti.search is invoked once with a throwaway query and group_id
    then interpret_facts is invoked once with an empty conversation and a throwaway facts_text (LLM client warmup)
    then logs "[gralkor] warmup — search:… interpret:… <total>ms" at INFO
  if any warmup call raises
    then the exception is caught and logged at :warning as "[gralkor] warmup failed (non-fatal): <reason>"
    and boot proceeds — warmup is best-effort
upstream-idle-survival (ts stack; src: server/main.py; unit: server/tests/test_upstream_idle_survival.py)
  applies to every server-side call into a Gemini-backed graphiti helper
    (embedder, LLM, reranker) — exercised by /recall, /distill flush,
    /capture flush, /build-indices, /build-communities
  when an endpoint is called after the server has been idle long enough for
    its pooled upstream connection to have gone away
    then the endpoint still responds within its normal latency envelope
ex-stack notes (no separate trees)
  rate-limit / 4xx / 5xx from upstream LLM calls: req_llm owns the retry-and-classify behaviour; ex layer surfaces whatever it returns to the consumer. No envelope normalisation.
  upstream-idle-survival: req_llm owns connection management; not a separately-tested concern at this layer.
  warmup-on-boot: covered by ex-graphiti-pool > init/1.
```

## Retry ownership

```
retry-ownership (stack-wide invariant; unit: none — other tree nodes in this file cite this section)
  then exactly one layer retries any given failure class
  then layers above the owner derive their timeout from that layer's worst case
  then no two layers retry the same class
  failure class: upstream LLM rate-limit (HTTP 429 from the configured provider)
    owner (ts stack): /recall on the server
      then the first 429 during /recall is absorbed by one retry before surfacing
    owner (ex stack): req_llm
      then req_llm's built-in 429 handling absorbs the first hit; the ex layer adds nothing
    then no other endpoint or call site retries this class — 429 surfaces immediately
    then no layer above the owner retries this class
  failure class: upstream LLM other (HTTP 408, 500, 502, 503, 504)
    ts stack: no owner — surfaces through the server's downstream-error-handling envelope
    ex stack: no owner — surfaces through req_llm's error tuple straight to the consumer
  failure class: LLM malformed output (structured-output parse failures, refusal)
    owner (ts stack): graphiti's GeminiClient
      then 2 attempts; the error text is appended to the next prompt
    owner (ex stack): graphiti-core (still — graphiti-core itself runs the structured-output retry loop, regardless of whether it is invoked via FastAPI or via PythonX)
      then 2 attempts; the error text is appended to the next prompt
    then no layer above retries this class
  failure class: client ↔ server transport (TCP reset, socket closed, connect timeout between adapter and Gralkor server)
    applies to the ts stack only (the ex stack has no HTTP transport between adapter and runtime)
    no owner — the failure surfaces immediately to the plugin
  failure class: server-internal / runtime-internal (graph write failure, FalkorDB driver error, internal distill crash)
    owner for the capture chain (ts stack): server-side capture_buffer (1s / 2s / 4s exponential)
    owner for the capture chain (ex stack): ex-capture-buffer (1s / 2s / 4s exponential)
    for all other chains: no owner — the failure surfaces immediately
  failure class: consumer-budget expired (the outermost timeout at the consumer)
    owner: the consumer (Susu2.ChatAgent 30 s ask_sync, OpenClaw turn budget)
      then returns to the user; logs at :warn; does not retry
```

Cross-referenced from `MENTAL_MODEL.md › Invariants › Retry ownership` and from `RETRY_MAP.md › Doctrine` at the workspace root.

## Timeouts

```
ts-client-timeouts (ts stack; integration: ts/test/client/http.test.ts)
  if the server returns any non-2xx HTTP response
    then the response surfaces as { error: { kind: "http_status", status, body } }
  if the transport fails with any error
    then the failure surfaces immediately
  per-endpoint receive window (milliseconds)
    /health                 2_000
    /recall                12_000   — matches the server's /recall deadline
    /capture                5_000
    /session_end            5_000
    /tools/memory_add      60_000
  admin endpoints have no client-side deadline
    /build-indices and /build-communities scan the whole graph and can run minutes to hours
    ts adapter passes no AbortController timer (timeoutMs: undefined)
  coverage notes
    ts: non-2xx-surfaces, transport-error-surfaces, all six receive windows, and both
        admin-no-deadline paths are exercised in test/client/http.test.ts via vi.useFakeTimers
        and a fetch stub that honours AbortSignal.
ex-timeouts (ex stack; integration: ex/test/gralkor/client/native_test.exs)
  in-process via PythonX — no transport class, no receive windows. Only two operations carry a
    deadline; everything else runs to completion or crashes the GenServer.
  per-operation deadline
    Gralkor.Client.recall/3       12_000ms   (see ex-recall > recall deadline)
    Gralkor.Client.memory_add/3   60_000ms   (graphiti entity/edge extraction)
  if either deadline is exceeded
    then in-flight PythonX work is cancelled (via the GraphitiPool worker)
    and the call returns {:error, :deadline_expired}
```

## Elixir Client

```
ex-client (src: ex/lib/gralkor/client.ex; unit: ex/test/support/gralkor_client_contract.ex; integration: ex/test/gralkor/client/native_test.exs and ex/test/gralkor/client/in_memory_test.exs)
  when recall/3 is called with a non-blank string session_id
    when the backend returns a memory block
      then {:ok, block} is returned
    if the backend fails
      then {:error, reason} is returned
  when recall/3 is called with a nil session_id
    when the backend returns a memory block
      then {:ok, block} is returned
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
  when memory_add/3 is called with group_id, content, and source_description
    when the backend acknowledges the add
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
ex-sanitize-group-id (src: ex/lib/gralkor/client.ex; unit: ex/test/gralkor/client_test.exs)
  when the id contains hyphens
    then hyphens are replaced with underscores
  when the id has consecutive hyphens
    then each hyphen is replaced independently
  when the id has no hyphens
    then it is returned unchanged
ex-impl-resolver (src: ex/lib/gralkor/client.ex; unit: ex/test/gralkor/client_test.exs)
  when :gralkor_ex/:client is unset in app env
    then Gralkor.Client.Native is returned
  when :gralkor_ex/:client is configured to a module
    then that module is returned
ex-client-native (src: ex/lib/gralkor/client/native.ex; integration: ex/test/gralkor/client/native_test.exs)
  then no HTTP is involved — calls dispatch directly to Gralkor.Recall, Gralkor.CaptureBuffer, Gralkor.Tools, and Gralkor.GraphitiPool in-process
  when recall is called with a non-blank string session_id
    then the session_id is forwarded to Gralkor.Recall.recall/1 and used to fetch buffered conversation
  when recall is called with a nil session_id
    then Gralkor.Recall is invoked with no session_id and the conversation context is empty
  if capture is called with a blank string session_id
    then the call raises with ArgumentError
  if capture is called with a nil session_id
    then the call raises with ArgumentError
  if end_session is called with a blank string session_id
    then the call raises with ArgumentError
  if end_session is called with a nil session_id
    then the call raises with ArgumentError
  (per-operation deadline behaviour is described in the Timeouts tree under ex-timeouts)
  runs the shared ex-client port contract (via test/support/gralkor_client_contract.ex)
ex-client-in-memory (src: ex/lib/gralkor/client/in_memory.ex; unit: ex/test/gralkor/client/in_memory_test.exs)
  when an operation is called
    then the call is recorded with its arguments for later inspection
  if no response is configured for an operation
    then {:error, :not_configured} is returned
  when reset/0 is called
    then configured responses and recorded calls are cleared
  runs the shared ex-client port contract (via test/support/gralkor_client_contract.ex)
(no ex-connection — the readiness gate is the synchronous boot of Gralkor.Python + Gralkor.GraphitiPool + Gralkor.CaptureBuffer. Application.start/2 doesn't return until they're all up.)
(no ex-orphan-reaper module — the redislite-orphan SIGKILL is the first step of ex-python-runtime's boot sequence, not a separate module.)
```

## TypeScript Client

```
ts-client (src: ts/src/client.ts; unit: ts/test/contract/gralkor-client.contract.ts; integration: ts/test/client/http.test.ts and ts/test/client/in-memory.test.ts)
  when recall is called with a non-blank string session_id
    when max_results is provided
      then it is forwarded to the backend (HTTP body includes max_results; in-memory recorder captures it)
    when max_results is omitted
      then no max_results is forwarded (server applies its default of 10)
    when the backend returns a memory block
      then { ok: block } is returned
    if the backend fails
      then { error: reason } is returned
  when recall is called with a null session_id
    when max_results is provided
      then it is forwarded to the backend (HTTP body includes max_results; in-memory recorder captures it)
    when max_results is omitted
      then no max_results is forwarded (server applies its default of 10)
    when the backend returns a memory block
      then { ok: block } is returned
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
ts-sanitize-group-id (src: ts/src/client.ts; unit: ts/test/client.test.ts)
  when the id contains hyphens
    then hyphens are replaced with underscores
  when the id has consecutive hyphens
    then each hyphen is replaced independently
  when the id has no hyphens
    then it is returned unchanged
ts-client-http (src: ts/src/client/http.ts; integration: ts/test/client/http.test.ts)
  then no Authorization header is attached to any request
  if Gralkor responds with a non-2xx status
    then { error: { kind: "http_status", status, body } } is returned
  when recall is called with a non-blank string session_id
    then the session_id field is included in the HTTP body
  when recall is called with a null session_id
    then the session_id field is omitted from the HTTP body
  if capture is called with a blank string session_id
    then the call throws
  if capture is called with a null session_id
    then the call throws
  if endSession is called with a blank string session_id
    then the call throws
  if endSession is called with a null session_id
    then the call throws
  (retry + per-endpoint timeout behaviour is described in the Timeouts tree)
  runs the shared ts-client port contract (via test/contract/gralkor-client.contract.ts)
ts-client-in-memory (src: ts/src/client/in-memory.ts; unit: ts/test/client/in-memory.test.ts)
  when an operation is called
    then the call is recorded with its arguments for later inspection
  if no response is configured for an operation
    then { error: "not_configured" } is returned
  when reset() is called
    then configured responses and recorded calls are cleared
  runs the shared ts-client port contract (via test/contract/gralkor-client.contract.ts)
ts-connection (src: ts/src/connection.ts; unit: ts/test/connection.test.ts)
  when waitForHealth(client, opts) is called
    then client.healthCheck() is polled until it resolves ok or the timeout elapses
    if the backend does not respond healthy within the timeout
      then the promise rejects so the caller can decide whether to retry or fail
  after ready
    then no further polling is scheduled — runtime outages surface on the next actual call
```

## Functional Journey

```
jido-memory-journey (ex stack; functional: ex/test/functional/end_to_end_test.exs)
  prerequisites
    given the ex application has booted Gralkor.Python with a real PythonX runtime, real graphiti-core, real falkordblite, and the configured LLM (req_llm)
    when no LLM API key is configured for the chosen provider
      then the suite is skipped
  round-trip
    given Gralkor.Client.memory_add/3 stores "Eli prefers concise explanations" under group "jido-test"
      when Gralkor.Client.recall/3 is called with a fresh session_id and a related query
        then {:ok, block} is returned
        and block is a non-empty <gralkor-memory> block
        and the block references the stored content semantically (contains "concise" or similar)
  session_end flush
    given a pending turn in Gralkor.CaptureBuffer (no idle elapsed)
      when Gralkor.Client.end_session/1 is called with the session_id
        then :ok is returned before the episode is ingested
        and the episode lands in the bound group_id without waiting for any idle window
        and a follow-up Gralkor.Client.recall/3 surfaces the turn content via search
  graceful-shutdown flush
    given a pending turn in Gralkor.CaptureBuffer (no idle elapsed)
      when the supervision tree stops (Application.stop or supervisor shutdown)
        then Gralkor.CaptureBuffer.terminate/2 awaits flush_all/0
        and the episode lands before the BEAM exits
      when the application is started again
        then a follow-up Gralkor.Client.recall/3 surfaces the previously-flushed episode
  runtime crash recovery
    when Gralkor.Python (the PythonX runtime owner) crashes
      then the supervisor restarts it
      and the next Gralkor.Client.recall/3 call returns {:ok, _} within the boot window
```

## Distribution

```
publish-ex-version-integrity (src: scripts/publish-ex.sh; unit: none)
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

## External deployment

`external/` is a fixture for the **ts stack only**. The ex stack has no thin-client mode (no HTTP transport at all), so `EXTERNAL_GRALKOR_URL` is unused on the ex side and there is no `external-thin-client-journey` for ex anymore. The verified behaviour for `external/` is the consumer-visible round-trip exercised by an `external-thin-client-journey` under the ts stack (when/if added there).

```
external-local-runnable (ts stack; src: external/serve.sh + external/Makefile)
  when serve.sh is started (directly or via `make up`)
    then a recall+capture round-trip succeeds against the running process from a ts-stack consumer with EXTERNAL_GRALKOR_URL set to http://localhost:${HOST_PORT}
    when SIGTERM is sent to the foreground process
      then uvicorn's graceful-shutdown handler flushes in-flight capture buffers within 30s before exit
```
