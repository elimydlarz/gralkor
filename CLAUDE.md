# Gralkor — monorepo

Gralkor is a persistent, temporally-aware memory service for AI agents, built on [Graphiti](https://github.com/getzep/graphiti) + [FalkorDB](https://www.falkordb.com/). This repo is the canonical home for the Python server and the two adapter libraries that wrap it.

## What lives here

| Path | Ships as | Consumer |
|---|---|---|
| `server/` | Python FastAPI server (Graphiti + embedded FalkorDB via `falkordblite`) | Spawned by adapter libraries as a managed child process |
| `ex/` | [`:gralkor_ex` on Hex](https://hex.pm/packages/gralkor_ex) | Elixir / OTP apps (`:jido_gralkor` and anything else that wants a `Gralkor.Client` port) |
| `ts/` | [`@susu-eng/gralkor-ts` on npm](https://www.npmjs.com/package/@susu-eng/gralkor-ts) | Node/TS harnesses (`@susu-eng/openclaw-gralkor` and anything else that wants a `GralkorClient` port) |

**Downstream harnesses live in sibling repos** and depend on the adapters above:

- `openclaw_gralkor` → [`@susu-eng/openclaw-gralkor`](https://www.npmjs.com/package/@susu-eng/openclaw-gralkor) — OpenClaw plugin (hooks + tools + native indexer).
- `jido_gralkor` → [`:jido_gralkor` on Hex](https://hex.pm/packages/jido_gralkor) — Jido plugin + ReAct tools.

## Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│  Harness repos (OpenClaw plugin / Jido plugin / future integrations)  │
│                                                                       │
│   openclaw_gralkor ──→ @susu-eng/gralkor-ts (npm)                     │
│   jido_gralkor    ──→ :gralkor_ex (Hex)                               │
└───────────────────────────────┬───────────────────────────────────────┘
                                │    Gralkor.Client / GralkorClient port
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Adapters (this repo)                                                 │
│                                                                       │
│   ex/  — HTTP adapter (Req), in-memory twin, boot gate, orphan reaper │
│   ts/  — HTTP adapter (fetch), in-memory twin, boot gate, spawner     │
│                                                                       │
│   Both bundle server/ at publish time and spawn it as a child.        │
└───────────────────────────────┬───────────────────────────────────────┘
                                │    loopback HTTP (127.0.0.1:4000)
                                ▼
┌───────────────────────────────────────────────────────────────────────┐
│  Python server (server/)                                              │
│                                                                       │
│   FastAPI / uvicorn                                                   │
│   Graphiti + falkordblite (embedded FalkorDB)                         │
│                                                                       │
│   Owns: capture buffer, turn distillation, recall interpretation,     │
│   driver lock, rate-limit passthrough, graceful-shutdown flush.       │
└───────────────────────────────────────────────────────────────────────┘
```

**Ownership split.** The server owns all memory behaviour — buffering per `session_id`, LLM-powered distillation of agent turns into behaviour lines, LLM-powered interpretation of recall results. Adapters are thin HTTP clients. Harnesses are adapter + hook wiring + UX.

**Server bundling.** Both adapters copy `server/` into their own package at build time:

- `ex/priv/server/` — written by `Mix.Tasks.Compile.GralkorPriv` on every `mix compile`.
- `ts/server/` — written by `ts/scripts/bundle-server.mjs` before `tsc` runs.

Both compilers wipe the destination first (so transient files like `.venv`, `__pycache__`, `wheels`, `tmp` don't leak into published tarballs) and share an identical skip list. At runtime both adapters resolve the bundled server through their package-local path (`:code.priv_dir(:gralkor_ex)` / `bundledServerDir()` relative to the compiled JS).

## Python server (`server/`)

FastAPI app in `main.py`. Pipelines live under `server/pipelines/`.

- `pipelines/formatting.py` — `format_fact`, `format_node`, `format_timestamp`.
- `pipelines/messages.py` — canonical `Message` Pydantic model (role ∈ `{"user", "assistant", "behaviour"}`, `content: str`). Single shape crossing the port; roles `user` / `assistant` are transcript text, `behaviour` is whatever harness-internal activity the adapter rolled up (thinking, tool calls, tool results) rendered as a string.
- `pipelines/interpret.py` — `interpret_facts(messages, facts_text, llm_client)` + `build_interpretation_context` (token-budgeted; oldest dropped first, role labels applied). Pydantic `InterpretResult` as `response_model` so all providers (Gemini/OpenAI/Anthropic/Groq) return `{"text": …}` consistently.
- `pipelines/distill.py` — `format_transcript(turns, llm_client)`, `safe_distill`. Uses `DistillResult` response_model. Input is `list[list[Message]]` — a list of turns, each turn a list of canonical Messages; the distiller reads any `behaviour` messages per turn and rolls them into a first-person past-tense summary.
- `pipelines/capture_buffer.py` — asyncio `CaptureBuffer` keyed by `session_id`. `loop.call_later` idle timer, retry schedule 1s/2s/4s (4xx not retried via `CaptureClientError`), `flush_all` drains on lifespan shutdown. `flush(session_id)` cancels the entry's idle timer and schedules the same retry-backed flush synchronously — used by `/session_end`.

Endpoints:

| Endpoint | Shape | Notes |
|---|---|---|
| `GET /health` | `200` when graph reachable | Consumers poll during boot; adapters disable client-side retry so failures surface fast |
| `POST /recall` | `{session_id, group_id, query, max_results}` → `{memory_block}` | Fast search → interpret (conversation context from `capture_buffer.turns_for(session_id)`) → `<gralkor-memory trust="untrusted">`. Empty graph → `{"memory_block": ""}` |
| `POST /distill` | `{turns: [[{role, content}, …], …]}` → `{episode_body}` | Parallel distillation via `asyncio.gather`; silent drop per turn on LLM failure |
| `POST /capture` | `{session_id, group_id, messages: [{role, content}, …]}` → `204` | Appends the message list to `capture_buffer` keyed by `session_id` (binds `group_id` on first append). Idle flush → `format_transcript` → `graphiti.add_episode` under bound `group_id` |
| `POST /session_end` | `{session_id}` → `204` | Cancels idle timer and schedules the same flush path as idle. Returns 204 without awaiting the graph write (fire-and-forget at every layer) |
| `POST /tools/memory_search` | `{session_id, group_id, query, max_results, max_entity_results}` → `{text}` | Slow search with cross-encoder. Empty → `"Facts: (none)\nEntities: (none)"` without calling interpret |
| `POST /tools/memory_add` | `{group_id, content, source_description?}` → `{"status":"stored"}` | Wraps `/episodes` with `source=EpisodeType.text`; auto-generates `name` + `idempotency_key` |
| `POST /build-indices` | `{}` → `{"status": string}` | Admin — operates on the whole graph |
| `POST /build-communities` | `{group_id}` → `{"communities": N, "edges": N}` | Admin — expensive per-group operation |
| `POST /search` | Underlying Graphiti search | Used internally by `/recall` and `/tools/memory_search` |
| `POST /episodes` | Underlying Graphiti episode ingest | Used internally by `/capture` flush and `/tools/memory_add` |

**Session keying rationale.** The server holds the in-flight conversation in `CaptureBuffer`, keyed by `session_id` (not `group_id`). One principal / group can run many concurrent sessions, so coarser keying would cross-contaminate the interpretation window. Adapters generate `session_id` (UUID-shaped), pass it on `/capture` to write and on `/recall` / `/tools/memory_search` to read.

**Auth.** None. The server binds to loopback only and is spawned by the consumer's own supervision tree (`Gralkor.Server` in ex/, `createServerManager` in ts/), so the only reachable caller is the consumer itself.

**Graceful shutdown.** FastAPI lifespan awaits `capture_buffer.flush_all()` before `graphiti.close()`. Uvicorn is launched with `--timeout-graceful-shutdown 30` so pending flushes complete before SIGKILL.

**Boot warmup.** Before `yield`, lifespan runs one `graphiti.search`, one `graphiti.search_` with `COMBINED_HYBRID_SEARCH_CROSS_ENCODER`, and one `interpret_facts` against a throwaway group/query to pay graphiti's cold-start cost (observed ~10 s on first `search`) before the health poll succeeds. Best-effort: any failure is logged at `:warning` and boot continues. Consumers see a longer boot window but a warm first `/recall`.

**LLM provider note.** Only Gemini's `generate_response(..., response_model=None)` returns `{"content": raw}`; OpenAI/Anthropic/Groq all coerce output to JSON/tool-use. Pass a Pydantic `response_model` to stay portable — see `pipelines/interpret.py` and `pipelines/distill.py`.

**Driver lock.** `graphiti.driver` is a global mutated by `add_episode()` and `_ensure_driver_graph()`. Concurrent requests for different `group_id`s can interleave and clobber each other's driver state. `_driver_lock = asyncio.Lock()` in `main.py` serialises all `add_episode`, `search`, and `build_communities` calls. Single-user agent semantics make serialisation acceptable.

**Model defaults — single source of truth.** `server/main.py` holds `DEFAULT_LLM_PROVIDER="gemini"`, `DEFAULT_LLM_MODEL="gemini-3.1-flash-lite-preview"`, `DEFAULT_EMBEDDER_PROVIDER="gemini"`, `DEFAULT_EMBEDDER_MODEL="gemini-embedding-2-preview"`. Any adapter writes `config.yaml` with provider/model omitted and lets the server fill in.

## Elixir adapter (`ex/`)

Published as `:gralkor_ex` on Hex. The package name was renamed from `:gralkor` at 1.3.0 so the published packages on either side carry matching `gralkor_ex` / `@susu-eng/gralkor-ts` names — version streams are independent (the npm package is at 1.0.0; the Hex package is at 2.0.0). Module namespace `Gralkor.*` is unchanged.

Modules:

- `Gralkor.Client` — behaviour + `sanitize_group_id/1` + `impl/0` app-env resolver (reads `Application.get_env(:gralkor_ex, :client)`, defaults to `Gralkor.Client.HTTP`).
- `Gralkor.Client.HTTP` — Req adapter. Reads `Application.get_env(:gralkor_ex, :client_http)` with `:url` (required) and `:plug` (optional `Req.Test` plug). No Authorization header, retry-once on transient transport errors (`:closed`/`:timeout`/`:econnreset`; `max_retries: 1`) mirroring the server→Gemini `httpx.HTTPTransport(retries=1)` pattern — also retry-once on HTTP 429, honoring the `Retry-After` header (capped at 5s, defaults to 1s if missing) to absorb transient upstream rate-limits; all other non-2xx and other transport errors surface immediately, per-endpoint receive_timeouts (health 2s, recall/search/capture/end_session 5s, memory_add 60s), tuple→list recursion before Jason encoding, blank-session_id raises `ArgumentError` on recall/capture/memory_search/end_session, `{:error, {:http_status, status, body}}` on non-2xx.
- `Gralkor.Client.InMemory` — test-only GenServer twin satisfying the shared port contract. Canned responses via `set_recall/1`, `set_capture/1`, `set_end_session/1`, `set_memory_search/1`, `set_memory_add/1`, `set_health/1`. Call recording via `recalls/0`, `captures/0`, `end_sessions/0`, `searches/0`, `adds/0`, `health_checks/0`. `reset/0` clears. Default `{:error, :not_configured}` when no response configured.
- `Gralkor.Server` — GenServer that spawns the Python child via Port. `init/1` is non-blocking; `handle_continue(:boot)` writes `config.yaml`, pre-flights the bind port (`:gen_tcp.listen`) — if already bound stops with `{:boot_failed, :port_in_use}` — then spawns `uv run uvicorn main:app --host 127.0.0.1 --port 4000 --timeout-graceful-shutdown 30`, health-polls at 500ms up to `boot_timeout_ms` (default 120s). Post-boot, liveness is detected exclusively from Port messages (`{:exit_status, _}` / `{:EXIT, _}`) — `/health` is not polled again. `terminate/2` extracts OS pid via `Port.info(port, :os_pid)`, sends SIGTERM, waits up to 30s, then SIGKILL.
- `Gralkor.Config` — `from_env/0` reads `GRALKOR_DATA_DIR` (required; `Path.expand`-ed to absolute), `GRALKOR_SERVER_URL` (optional; default `http://127.0.0.1:4000`), `GRALKOR_SERVER_DIR` (optional; default packaged `priv/server/`), provider/model fields (optional). `write_yaml/1` emits `$GRALKOR_DATA_DIR/config.yaml` with `llm:` / `embedder:` sections omitted when the fields are nil — the server fills in defaults.
- `Gralkor.Connection` — GenServer boot-readiness gate. `init/1` synchronously polls `Client.health_check/0` with backoff until healthy or boot window expires; `{:stop, {:gralkor_unreachable, reason}}` on timeout.
- `Gralkor.OrphanReaper` — pre-OTP cleanup. `reap/1` (accepts `shell:` injection for tests) shells `lsof` for port 4000, SIGKILLs if the command line contains every identifier in `@identifiers` (`"uvicorn"`, `"main:app"`, `"--port 4000"` — the invariant shape `Gralkor.Server` spawns), raises with foreign command line otherwise. Keys on command-line args rather than priv-dir paths because mix symlinks path-dep priv dirs and `ps` reports the resolved physical path — so a path-substring match would miss legitimate orphans under path-dep builds.
- `Gralkor.Health` — thin `Req.get/2` wrapper over `/health`. Disables Req's default retry (`retry: false`).
- `Mix.Tasks.Compile.GralkorPriv` — custom compiler that runs after `:elixir`. On every `mix compile`: wipes `priv/server/`, recopies `../server/` excluding `.venv`/`.pytest_cache`/`__pycache__`/`wheels`/`tests`/`mutants`/`tmp`/`.pyc`. The wipe is load-bearing — anyone running `uv sync` or `pytest` with `ex/priv/server/` as cwd would otherwise materialise a `.venv`/`.pytest_cache`/`tmp` that `mix hex.publish` would bundle and blow past Hex's 134 MB uncompressed limit. `priv/server/` is `.gitignore`d.

Deps: `req` (HTTP for `/health` and client), `jason`. No Jido dep — this is a bare OTP release consumed *by* Jido via `:jido_gralkor`.

Release via `pnpm run publish:ex -- patch|minor|major|current` from the monorepo root. Bumps `@version` in `ex/mix.exs`, runs `mix hex.publish --yes`, tags `gralkor-ex-v${version}`. Version stream is independent of the npm one.

## TypeScript adapter (`ts/`)

Published as `@susu-eng/gralkor-ts` on npm. Mirrors the Elixir adapter's port layout.

Modules:

- `src/client.ts` — `GralkorClient` port interface, canonical `Message` / `Role` types, `sanitizeGroupId()` helper.
- `src/client/http.ts` — `GralkorHttpClient` (fetch-based). Per-endpoint timeouts, `{ ok }` / `{ error }` result shape.
- `src/client/in-memory.ts` — `GralkorInMemoryClient`. Canned responses + call recording + `reset()`. Also exported from `@susu-eng/gralkor-ts/testing`.
- `src/connection.ts` — `waitForHealth(client, opts)`. Polls `healthCheck()` with backoff until healthy or timeout; throws on timeout.
- `src/server-manager.ts` — `createServerManager(opts)` spawns `uv run uvicorn main:app` as a managed child. On `start()`: any process holding the configured port is killed before spawning (SIGTERM → wait 5s → SIGKILL → wait 2s → fail). The port is reserved for us; no pidfile, no adoption, no foreign-process discrimination. Every `start()` pays cold-start cost; simpler than tracking who-owns-what. `buildConfigYaml(opts)` emits `llm:` / `embedder:` sections only when the consumer passes `llmConfig` / `embedderConfig` — otherwise the server applies its own defaults. On `linux/arm64`, resolves a prebuilt `falkordblite` wheel (bundled under `server/wheels/` or downloaded from GH Releases into `dataDir/wheels/`) because PyPI's arm64 sdist embeds x86-64 binaries on glibc < 2.39 hosts.
- `src/server-env.ts` — `buildSyncEnv`, `buildPipEnv`, `buildSpawnEnv` — consolidate env var wiring for the three uv invocations.
- `scripts/bundle-server.mjs` — pre-build step that copies `../server/` → `ts/server/`. Runs before `tsc` (via `"build": "pnpm run bundle-server && tsc"`).

The shared port contract (`GralkorClient`) is reified by `test/contract/gralkor-client.contract.ts` — imported by both the HTTP and in-memory adapter test files.

Release via `pnpm run publish:ts -- patch|minor|major|current` from the monorepo root. Bumps `version` in `ts/package.json`, runs `pnpm publish`, tags `gralkor-ts-v${version}`.

## Test trees

Full contract in [TEST_TREES.md](./TEST_TREES.md). Sections:

- **Recall** — server-side `/recall` endpoint + `interpret-facts` pipeline.
- **Capture** — server-side `/distill`, `/capture`, `/session_end`, `capture-buffer`, `turns_to_conversation`, `format-transcript`.
- **Tools** — server-side `/tools/memory_search`, `/tools/memory_add`, `/build-indices`, `/build-communities`.
- **Startup** — `ex-server-lifecycle`, `ex-config-writing`, `ts-server-manager`, `ts-bundle-server`.
- **Configuration** — `validateOntologyConfig` (ts/), `server-config-defaults`, `cross-encoder-selection`.
- **Operations** — `/health`, `rate-limit-retry`, `driver-lock-serialization`, `downstream-error-handling`.
- **Timeouts** — `client-timeouts` (shared adapter contract: retry-once on transient transport errors, per-endpoint receive windows, admin-no-deadline).
- **Elixir Client** — `ex-client`, `ex-sanitize-group-id`, `ex-impl-resolver`, `ex-client-http`, `ex-client-in-memory`, `ex-connection`, `ex-orphan-reaper`.
- **TypeScript Client** — mirror of the Elixir Client section for `ts/`.
- **Functional Journey** — `jido-memory-journey` (Elixir-driven end-to-end with real LLM + falkordblite).
- **Distribution** — `publish-ex-version-integrity`.

## Building & publishing

```bash
pnpm run publish:ex -- patch|minor|major|current   # → :gralkor_ex on Hex, tag gralkor-ex-v${v}
pnpm run publish:ts -- patch|minor|major|current   # → @susu-eng/gralkor-ts on npm, tag gralkor-ts-v${v}
```

Each cadence is independent; each publishes from the matching subdirectory. Both run their subdirectory's full test suite before release.

## Gotchas

- `falkordblite` installs as Python module `redislite`, not `falkordblite`.
- `falkordblite` 0.9.0 arm64: PyPI wheel requires `manylinux_2_39` (glibc 2.39+); Bookworm ships 2.36, so `uv sync` falls back to the sdist which embeds x86-64 binaries. Both adapters ship a prebuilt wheel for linux/arm64 (bundled from `server/wheels/` or resolved to the GH Release asset).
- Graphiti requires an LLM API key — server starts without one but all operations fail.
