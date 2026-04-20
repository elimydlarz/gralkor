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

### Plugin Registration & API Contract

- `register(api)` **must be synchronous** — async silently registers nothing.
- Config arrives on `api.pluginConfig` (plain object from `plugins.entries.<id>.config`). `resolveConfig()` merges defaults; `validateOntologyConfig()` runs.
- `registerFullPlugin()` owns shared state: `groupIdBySession` Map (`getGroupId`/`setSessionData`), `serverReady` gate, module-level `ReadyGate` (survives reloads).
- Server at `http://127.0.0.1:8001`.
- `registerTool({ execute(toolCallId, params, signal, onUpdate) })` — plain tool, no factory.
- `api.on(event, handler)` preferred; `registerHook` crashes without `metadata: { name }`.
- `registerService({ id, start, stop })` — `id` not `name`. `registerCli` mounts under `openclaw`. Plugins do no LLM inference.

### Hook Behavior

Handlers receive `(event, ctx)`. Agent ctx: `{ agentId?, sessionKey?, sessionId?, workspaceDir?, messageProvider? }`. Session ctx: `{ agentId?, sessionId, sessionKey? }`.

**Hooks used by gralkor:**

| Hook | `event` shape | Execution | Notes |
|---|---|---|---|
| `before_prompt_build` | `{ prompt, messages? }` | Sequential | Auto-recall: inject context before prompt |
| `agent_end` | `{ messages, success, error, durationMs }` | Fire-and-forget | Fires per agent run (not per session). Gateway doesn't await. |
| `session_end` | `{ sessionId, sessionKey?, messageCount, durationMs? }` | Fire-and-forget | **No messages payload** — metadata only. Fires when previous session replaced. |

**Message format:** `event.messages[].content` is `{ type, text?, ... }[]`. Types: `"text"`, `"output_text"`, `"thinking"`, `"toolCall"`, `"toolUse"`, `"functionCall"`. Roles: `"user"`, `"assistant"`, `"toolResult"`, `"tool"` (Ollama), `"compactionSummary"`. Other available hooks (not used): `before_model_resolve`, `before_agent_start` (fires twice), `llm_input`/`llm_output`, `before_compaction`/`after_compaction`, `before_reset`, `message_*`, `before_tool_call`/`after_tool_call`, `tool_result_persist`/`before_message_write` (synchronous), `session_start`, `subagent_*`, `gateway_*`.

### Data Lifecycle

Behavioural spec lives in the Recall/Capture/Tools test trees; pipeline order summarised here.

- **Auto-recall** (`before_prompt_build`): `extractInjectQuery` → `setSessionData` + `setSessionMessages` → fast `client.search()` → `interpretFacts()` (shared; ~250K token budget, oldest dropped first; throws if `llmClient` missing) → `<gralkor-memory trust="untrusted">` with `Session-key:`.
- **Auto-capture** (`agent_end` → `DebouncedFlush` keyed by `sessionKey || agentId || "default"`; force-flushed by `session_end`): `extractMessagesFromCtx` → `formatTranscript` (`src/distill.ts`) groups thinking/`tool_use`/`tool_result` per turn, distil input includes user message + behaviour blocks + agent response (anchors the small LLM against free-associating from filenames) → first-person `(behaviour: …)` line → `client.ingestEpisode`.
- **Flush retries**: 3× exponential (1s/2s/4s), 4xx not retried. SIGTERM → `flushAll()` once via module guard.

### Graph Partitioning

- Tools have no ctx; they require `session_key` which the model reads back from the injected memory block. `getGroupId(sessionKey)` **throws** for unregistered keys — no silent fallback to a wrong partition.
- `sanitizeGroupId` (hyphens → underscores) runs **once** at write time inside `setSessionData`; all readers get the pre-sanitized value from the map.
- graphiti-core: `add_episode()` clones the driver per `group_id`, but `search()` doesn't route — fixed by `_ensure_driver_graph()` in `main.py`.
- **Driver lock:** `graphiti.driver` is a global mutated by both `add_episode()` and `_ensure_driver_graph()`. Concurrent requests for different `group_id`s can interleave and clobber each other's driver state, losing data on writes and returning wrong results on reads. Fix: `_driver_lock = asyncio.Lock()` in `main.py` serializes all `add_episode`, `search`, and `build_communities` calls. Single-user agent semantics make serialization acceptable.

### Server Manager Lifecycle

Service `gralkor-server` in `src/server-manager.ts`. See Startup and `bundled-wheel-arch-selection` test trees for behaviour.

- **Install**: on `linux/arm64` → `resolveBundledWheels(serverDir, dataDir, version)` tries `${serverDir}/wheels/*.whl` (npm path) else downloads from `github.com/elimydlarz/gralkor/releases/v${version}/` into `${dataDir}/wheels/` (ClawHub path; wheel exceeds ClawHub's 20 MB upload limit). Then `uv sync --no-dev --frozen --no-install-package falkordblite` + `uv pip install --no-deps` the resolved wheel. Other platforms: plain `uv sync --no-dev --frozen`.
- **Secrets**: `buildSecretEnv()` in `register.ts` maps `config.*ApiKey` strings to env vars — synchronous, no `process.env` reads.
- **Spawn**: read `server.pid` → SIGTERM prior pid → poll port free (≤10s) → uvicorn on `127.0.0.1:8001` with `CONFIG_PATH`/`FALKORDB_DATA_DIR`. Health poll 500ms (120s timeout), then 60s monitor. Healthy → `serverReady.resolve()`. SIGTERM → 5s → SIGKILL. `stop()` deletes `server.pid`. First start ~1–2 min.
- **Self-start** (`registerServerService`): fire-and-forget `manager.start()` at registration — bypasses a host bug excluding memory-kind plugins from gateway startup scope. Manager cached at module level; pre-flight health check skips spawn if server already running after module re-eval.

### Communication Path

Plugin → `GraphitiClient` (`src/client.ts`, HTTP) → REST → FalkorDB.

- 2 retries (500ms/1s) for network/5xx; 4xx immediate (except 429).
- `POST /search` returns `{ facts, nodes }`. Fast mode = `graphiti.search()` (RRF, edges only). Slow mode = `graphiti.search_()` with `COMBINED_HYBRID_SEARCH_CROSS_ENCODER` (cross-encoder + BFS, facts + entity summaries).
- `POST /episodes` carries pre-formatted `episode_body`; server passes verbatim to `graphiti.add_episode()`. UUID per call as `idempotency_key` (in-memory dedup, process lifetime).
- **Rate-limit passthrough:** middleware → 429 + `Retry-After`; client retries 429s indefinitely (guided by `Retry-After`), independent of the 5xx retry budget. Cancellable via `AbortSignal`.

### Elixir supervisor (`ex/`) — for Jido consumers

The Python server runs under an OTP supervisor in `ex/`. Integration mode: **embed `Gralkor.Server` in the consumer's Jido supervision tree** — `mix.exs` path/Hex dep, one child in the tree, same BEAM node owns the Python child via Port. Graceful shutdown flows through OTP termination → SIGTERM → Python lifespan flush. No Docker — if decoupled-scaling or multi-tenant deployment becomes a real need, a container can be reintroduced (the Port-based supervisor doesn't preclude it).

- `Gralkor.Config` — `from_env/0` reads `GRALKOR_*` env vars (fail-fast on missing `GRALKOR_DATA_DIR`); `write_yaml/1` emits `$GRALKOR_DATA_DIR/config.yaml` the Python server consumes. `GRALKOR_DATA_DIR` is `Path.expand`-ed to absolute immediately — `Gralkor.Server` spawns the Python child with `cd: server_dir` (the packaged `priv/server/`), so any relative `data_dir` would resolve against Python's cwd, not the operator's, and FalkorDB/`config.yaml` would end up in the wrong place. Provider/model fields default to nil — when nil, the YAML emission omits the section entirely and the **server** applies defaults (`DEFAULT_LLM_PROVIDER` / `DEFAULT_LLM_MODEL` / `DEFAULT_EMBEDDER_PROVIDER` / `DEFAULT_EMBEDDER_MODEL` in `server/main.py`). The Elixir side is pure passthrough: no default-picking. Optional `capture_idle_seconds` field emits a `capture: idle_seconds: N` section when set.

**Model defaults — single source of truth in the server.** `server/main.py` holds `DEFAULT_LLM_PROVIDER="gemini"`, `DEFAULT_LLM_MODEL="gemini-3.1-flash-lite-preview"`, `DEFAULT_EMBEDDER_PROVIDER="gemini"`, `DEFAULT_EMBEDDER_MODEL="gemini-embedding-2-preview"`. Any client (Elixir supervisor, TS plugin, future wrappers) writes config.yaml with provider/model omitted and lets the server fill in. **Open inconsistency:** `src/config.ts` (the TS/OpenClaw plugin) still picks its own client-side defaults (`DEFAULT_LLM_PROVIDER`, `DEFAULT_LLM_MODEL`, `DEFAULT_EMBEDDER_PROVIDER`, `DEFAULT_EMBEDDER_MODEL`) and writes them into config.yaml via `resolveConfig`. Values currently match the server's but the duplication invites drift. A future consolidation could move the TS side to match the Elixir pattern (omit-and-let-server-default); until then, keep the four constants in sync across both layers.
- `Gralkor.Server` — GenServer. `init/1` is non-blocking; `handle_continue(:boot)` writes config, **pre-flights the bind port** (`:gen_tcp.listen` on the port parsed from `server_url`) — if already bound it stops with `{:boot_failed, :port_in_use}` before spawning — then spawns `uv run uvicorn main:app --host 127.0.0.1 --port 4000 --timeout-graceful-shutdown 30` via `Port.open`, health-polls at 500ms up to a configurable `boot_timeout_ms` (default 120s), then schedules a 60s monitor. Boot loop peeks the mailbox each iteration so a dying port fails fast instead of hitting the full timeout. BEAM SIGKILL / Ctrl-C abort skips `terminate/2`, orphaning the Python child; the port pre-flight surfaces that state as `{:boot_failed, :port_in_use}` on the next boot (operator clears the orphan manually) rather than crash-looping on `EADDRINUSE`.
- `Gralkor.Health` — thin `Req.get/2` wrapper over `/health`. **Disables Req's default retry** (`retry: false`) so boot polls and monitor ticks see failures immediately instead of waiting out Req's 1s/2s/4s schedule — critical for the 30s shutdown window not being consumed by an in-flight retry.
- `terminate/2` — extracts OS pid via `Port.info(port, :os_pid)`, sends `SIGTERM` via `System.cmd("kill", …)`, waits up to 30s for the exit message, then `SIGKILL`.
- Deps: `req` (HTTP for `/health`), `jason`. No Jido dep — this is a bare OTP release consumed *by* Jido.
- **Package layout**: the Python source ships under `ex/priv/server/` via `Mix.Tasks.Compile.GralkorPriv`, a custom compiler that runs after `:elixir`. On every `mix compile` it **wipes** `priv/server/` and recopies `../server/` (excluding `.venv`/`.pytest_cache`/`__pycache__`/`wheels`/`tests`/`mutants`/`tmp`/`.pyc`) — the wipe is load-bearing because anyone running `uv sync` or `pytest` with `ex/priv/server/` as cwd would otherwise materialize a `.venv`/`.pytest_cache`/`tmp` there that `mix hex.publish` would bundle into the tarball and blow past Hex's 134 MB uncompressed limit. `Gralkor.Config.default_server_dir/0` resolves to `:code.priv_dir(:gralkor) |> Path.join("server")`, so both path-deps and hex-installed consumers find the server without needing to set `GRALKOR_SERVER_DIR`. `priv/server/` is `.gitignore`d — it's regenerated from `../server/` on every compile.
- **Hex**: published as `:gralkor`. `mix hex.build` produces an ~87 KB tarball (just Python source + Elixir lib + config + README — no venv, no wheels). Release via `pnpm run publish:ex -- patch|minor|major|current` (bumps `@version` in `ex/mix.exs`, runs `mix hex.publish --yes`, commits, tags `ex-v${version}`). Version stream is independent of the npm/ClawHub one (`v${version}`).

### Server-side pipelines & endpoints (for thin Jido/Elixir clients)

The Python server hosts shared helpers so any client (TS/OpenClaw, Elixir/Jido, …) is a thin HTTP adapter. Helpers live in `server/pipelines/`:

- `pipelines/formatting.py` — `format_fact`, `format_node`, `format_timestamp`.
- `pipelines/message_clean.py` — `clean_user_message_text`, `strip_gralkor_memory_xml`, `SYSTEM_MESSAGE_PATTERNS`, `SYSTEM_MESSAGE_MULTILINE_PATTERNS`, `build_interpretation_context` (token-budgeted; oldest dropped first).
- `pipelines/interpret.py` — `interpret_facts(messages, facts_text, llm_client)`; passes a one-field Pydantic `InterpretResult` as `response_model` so all providers (Gemini/OpenAI/Anthropic/Groq) return `{"text": …}` consistently. Fail-fast on `None` or empty.
- `pipelines/distill.py` — `format_transcript(turns, llm_client)`, `safe_distill` (returns empty on LLM failure). Uses `DistillResult` response_model. **`Turn.events` is `list[Any]` — the consumer sends whatever event shape it has (ReAct atoms, LangChain messages, free strings); the renderer JSON-serialises each event into the distill prompt. Inference tolerates loose input, so no schema enforcement.**
- `pipelines/capture_buffer.py` — asyncio `CaptureBuffer` keyed by `session_id`; each entry stores the `group_id` bound on first append (rebinding raises). `loop.call_later` idle timer, retry schedule 1s/2s/4s (4xx not retried via `CaptureClientError`), `flush_all` drains on lifespan shutdown. `flush(session_id)` cancels the entry's idle timer and schedules the same retry-backed flush synchronously-returning — used by `/session_end` to fire the write before an idle window elapses without awaiting the graph I/O. `turns_for(session_id)` exposes buffered turns for in-flight conversation context; `turns_to_conversation(turns)` flattens them into `ConversationMessage`s (user_query + assistant_answer; events are *not* included — they're LLM-distilled at flush time, not raw conversation).

Endpoints added in `main.py`:

| Endpoint | Shape | Notes |
|---|---|---|
| `POST /recall` | `{session_id, group_id, query, max_results}` → `{memory_block}` | Fast search → interpret (conversation context pulled from `capture_buffer.turns_for(session_id)`) → `<gralkor-memory trust="untrusted">` with further-querying instruction. Empty graph → `{"memory_block": ""}` (not null). |
| `POST /distill` | `{turns: [{user_query, events, assistant_answer}]}` → `{episode_body}` | Parallel distillation via `asyncio.gather`; silent drop per turn on LLM failure. |
| `POST /capture` | `{session_id, group_id, turn}` → `204` | Appends to `capture_buffer` keyed by `session_id` (binds `group_id` on first append). Idle flush calls `_capture_flush` → `format_transcript` → `graphiti.add_episode` under the bound `group_id`. |
| `POST /session_end` | `{session_id}` → `204` | Cancels the session's idle timer and schedules the same flush path as idle flush; returns 204 without awaiting the graph write (fire-and-forget at every layer — episode writes are slow, consumers must not block). 204 no-op if the session has no buffered turns; 422 on blank/missing `session_id`. |
| `POST /tools/memory_search` | `{session_id, group_id, query, max_results, max_entity_results}` → `{text}` | Slow search with cross-encoder; conversation context pulled from `capture_buffer.turns_for(session_id)` (same rules as `/recall`). `Facts:` + `Entities:` + `Interpretation:`; **no** further-querying instruction. Empty → `"Facts: (none)\nEntities: (none)"` without calling interpret. |
| `POST /tools/memory_add` | `{group_id, content, source_description?}` → `{"status":"stored"}` | Wraps `/episodes` with `source=EpisodeType.text`; auto-generates `name` + `idempotency_key`. |

**Session keying rationale.** The server holds the in-flight conversation in `CaptureBuffer`, keyed by `session_id` (not `group_id`). One principal / group can run many concurrent sessions, so coarser keying would cross-contaminate the interpretation window. Callers generate `session_id` (UUID-shaped), pass it on `/capture` to write and on `/recall` / `/tools/memory_search` to read. They still pass `group_id` on those reads because it selects the graph — `session_id` alone is only a buffer key.

**Auth:** none. The server binds to loopback only and is spawned by the consumer's own supervision tree (`Gralkor.Server` in ex/), so the only reachable caller is the consumer itself. No middleware, no bearer-token check — all endpoints are mounted on a single router. If a multi-host deployment ever changes the threat model, re-add a bearer-token dependency and split the routers.

**Graceful shutdown:** lifespan awaits `capture_buffer.flush_all()` before `graphiti.close()`. Uvicorn must be launched with `--timeout-graceful-shutdown 30` so pending flushes complete before SIGKILL.

**LLM provider note:** only Gemini's `generate_response(..., response_model=None)` returns `{"content": raw}`; OpenAI/Anthropic/Groq all coerce output to JSON/tool-use. Pass a Pydantic `response_model` to stay portable — see `pipelines/interpret.py` and `pipelines/distill.py`.

## Requirements

### Functional

Test trees (the contract) live in [TEST_TREES.md](./TEST_TREES.md). Tests in `src/*.test.ts`, `test/integration/`, `test/functional/`, and `server/tests/` mirror them one-to-one. Sections: Recall, Capture, Tools, Startup, Configuration, Operations, Functional Journey, Distribution.

New server-side trees landed in Phase A (Gralkor ↔ Jido interface, see `GRALKOR_JIDO_INTERFACE.md` in Susu2): `POST /recall endpoint`, `POST /distill endpoint`, `POST /capture endpoint`, `capture-buffer (Python)`, `format-transcript (Python)`, `interpret-facts (Python)`, `message-clean (Python)`, `POST /tools/memory_search endpoint`, `POST /tools/memory_add endpoint`.

Elixir supervisor trees (Phase B) in the Startup section: `ex-server-lifecycle`, `ex-config-writing`. Test files: `ex/test/gralkor/{server_test.exs, config_test.exs}`. Run via `mix test.unit` and `mix test.integration` from `ex/`.

Elixir-driven functional tree: `jido-memory-journey` (Functional Journey section). File: `ex/test/functional/end_to_end_test.exs`. Run via `mix test.functional`. Requires `GOOGLE_API_KEY`; skips cleanly when unset. Boots the real Python server (Graphiti + falkordblite + Gemini) under `Gralkor.Server` and validates the Jido-consumer HTTP contract end-to-end.

### Cross-functional

| Requirement | Implementation |
|---|---|
| fail-fast | `ReadyGate` (module-level, `src/config.ts`): before ready → throw. Graph failures propagate. |
| observability | Two-tier logging. Normal tier: `[gralkor] …` metadata/length (INFO). Test tier: `[gralkor] [test] …` full payloads (DEBUG, gated by `test: true`). Server-side runtime logs cover recall query/result, tools.memory_search query/result, and capture (single save log + pre- and post-distilled payloads in test). Uvicorn access logs suppressed via `--no-access-log`. `[gralkor] boot:` markers: `register()` logs `boot: plugin loaded (v...)` / `boot: register() failed:`; server-manager logs `boot: starting/ready`; health poll logs unique errors + attempt count; self-start logs outcome. |
| retry-backoff | Client: 2 retries (500ms/1s) network/5xx. Flush: 3 retries (1s/2s/4s). 4xx not retried (except 429). |
| rate-limit-passthrough | Middleware: `RateLimitError` → 429 + `Retry-After`. Client retries 429s indefinitely (guided by `Retry-After`), independent of 5xx budget. |
| downstream-error-handling | Middleware maps provider HTTP status: 400 (non-credential) / 404 / 422 → 500; 400 (credential hint, e.g. Gemini expired key) / 401 / 403 → 503; other 4xx / 5xx → 502; no status → 500. |
| untrusted-context | Facts in `<gralkor-memory trust="untrusted">` XML. |
| health-monitoring | 60s ping on child process. |
| capture-hygiene | `SYSTEM_MESSAGE_PATTERNS` + `SYSTEM_MESSAGE_MULTILINE_PATTERNS` in `src/hooks.ts`. `stripGralkorMemoryXml()` shared across all roles. User: unwrap metadata → multi-line early-out → strip XML/footer → filter system lines. Assistant: strip XML → per-block `isSystemMessage`. ToolResult/tool: strip XML → truncate. `"tool"` = `"toolResult"`. |
| prompt-robustness | `extractInjectQuery` reads trailing user messages from `event.messages` (ignores `event.prompt`); each cleaned via `cleanUserMessageText`. |
| query-sanitization | `_sanitize_query()` strips backticks (RediSearch). `sanitizeGroupId()` replaces hyphens with underscores to avoid RediSearch syntax errors. |
| bundled-arm64-wheel | `scripts/build-arm64-wheel.sh` builds falkordblite for `linux/arm64` via Docker (called by `pack.sh`, `publish-npm.sh`, `publish-clawhub.sh`). Shipped two ways: (a) bundled in npm tarball under `server/wheels/`; (b) uploaded as a GH Release asset by `publish-clawhub.sh` and fetched on first start by `resolveBundledWheels()` (exceeds ClawHub's 20 MB limit). Only active on `linux/arm64`. |
| configurable-providers | `llm`/`embedder`/`cross_encoder` in config; dynamic `config.yaml` at startup. `_build_cross_encoder()` matches reranker to LLM provider (Gemini → `GeminiRerankerClient`; else OpenAI key → `OpenAIRerankerClient`; else `None`). |
| episode-idempotency | UUID per call; server deduplicates (in-memory, process lifetime). |

## Repo Map

`src/` — `index.ts` (entry), `register.ts`, `tools.ts`, `hooks.ts`, `client.ts`, `server-manager.ts`, `native-indexer.ts`, `distill.ts`, `config.ts`, `llm-client.ts`, `types.ts`, `*.test.ts`. `server/` Python/FastAPI (`main.py`, `tests/`, `wheels/`). `test/integration/` mocked, `test/functional/` Docker harness. `openclaw.plugin.json` is the active manifest.

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

`openclaw plugins install -l .` to install locally. `pnpm run typecheck`, `pnpm test` (typecheck + unit + integration), `pnpm run test:unit|test:integration|test:functional` (each has `:ts`/`:py` halves; functional has `:both` for arm64+amd64). `pnpm run setup:server` syncs the venv once. TDD: failing tests first. Tree reporters (vitest `tree`, pytest `--spec`).

**Test layers** (TS + Python halves per layer): **unit** — `src/*.test.ts`, `server/tests/*.py` (excl. `test_integration.py`), mocked Graphiti; **integration** — `test/integration/*.integration.test.ts` (real plugin lifecycle, mocked externals), `server/tests/test_integration.py` (real FalkorDBLite + Graphiti); **functional** — `test/functional/` Docker harness, real OpenClaw + real LLM, no mocks.

## Building & Deploying

`publish:npm` / `publish:clawhub` each publish the OpenClaw plugin to one registry (each accepts `patch|minor|major|current`; `current` skips the bump). `publish:ex` releases the Elixir adapter (`ex/mix.exs`) on its own Hex version stream, tagged `ex-v${version}`. `publish:ts` releases the TypeScript adapter (`ts/package.json`) on its own npm version stream, tagged `gralkor-ts-v${version}`. Each release cadence is independent. `pnpm run pack` builds a deployment tarball (arm64 wheel via Docker). Requires `uv`. Docker HOME split: `ln -sfn /data/.openclaw /root/.openclaw`. Behaviour in the publish test trees.

**ClawHub uploads** — `.clawhubignore` (gitignore syntax) is the only exclusion file the clawhub CLI honours (not `.gitignore`/`.npmignore`/`package.json#files`), so it whitelists (`*` + `!`-unignores) mirroring npm's `files`, with explicit `.env*` deny. `server/wheels/` is excluded (20 MB limit); `publish-clawhub.sh` `gh release upload`s the arm64 wheel to the matching `v${version}` release instead.

## Conventions

- TypeScript, ESM, ES2022, bundler resolution. `.js` extensions required.
- All Graphiti communication via HTTP through `src/client.ts`
- Targets OpenClaw 2026.4.2 (pinned in `peerDependencies.openclaw` in `package.json` — single source of truth; `build.sh` passes this to Docker as `OPENCLAW_VERSION`). Do not add compatibility shims or workarounds for older versions.
  - **To update the targeted OpenClaw version:** change `peerDependencies.openclaw` (and `dependencies.openclaw`) in root `package.json` to the new exact version. That's it — `build.sh` reads it and passes `--build-arg OPENCLAW_VERSION=<version>` to docker, the `Dockerfile` ARG default is cosmetic only. Also update `README.md` (`Prerequisites` line). The `test/harness/gralkor-src/package.json` is overwritten at build time by `build.sh` (it copies root `package.json` into the build context), so it doesn't need a separate edit.
- When understanding current OpenClaw behaviour, check the clone at `/tmp/openclaw` — always run `git pull` there first to ensure it reflects the latest version

## Gotchas

- `falkordblite` installs as Python module `redislite`, not `falkordblite`.
- `falkordblite` 0.9.0 arm64: PyPI wheel requires `manylinux_2_39` (glibc 2.39+); Bookworm ships 2.36, so `uv sync` falls back to the sdist which embeds x86-64 binaries → `RedisLiteServerStartError`. Fix: prebuilt wheel via `build-arm64-wheel.sh`, resolved by `resolveBundledWheels()` (see Server Manager Lifecycle). `FalkorDriver.__init__()` fires index build on every clone (noisy but caught).
- Graphiti requires an LLM API key — server starts without one but all operations fail.
- `AbortError` in auto-capture — from Node HTTP layer (connection reset/SIGTERM), not gateway.
- Native `memory_search` empty without embedding provider (upstream bug).
- **Plugin tools blocked by tool profiles:** `coding` profile allowlists core tools only. Workaround: `"alsoAllow": ["gralkor"]` (or list tools individually) in `tools` config.

