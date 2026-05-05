# Gralkor — monorepo

Gralkor is a persistent, temporally-aware memory service for AI agents, built on [Graphiti](https://github.com/getzep/graphiti) + [FalkorDB](https://www.falkordb.com/). This repo is the canonical home for the Python server and the two adapter libraries that wrap it.

## What lives here

| Path | Ships as | Consumer |
|---|---|---|
| `ts/` | [`@susu-eng/gralkor-ts` on npm](https://www.npmjs.com/package/@susu-eng/gralkor-ts) — owns `ts/server/`, the Python FastAPI server (Graphiti + embedded FalkorDB via `falkordblite`) | Node/TS harnesses (`@susu-eng/openclaw-gralkor` and anything else that wants a `GralkorClient` port). The TS adapter spawns `ts/server/` as a managed child, or talks to a standalone one via `external/` |
| `ex/` | [`:gralkor_ex` on Hex](https://hex.pm/packages/gralkor_ex) — no Python server child; pipelines reimplemented in Elixir for parity with `ts/server/` | Elixir / OTP apps (`:jido_gralkor` and anything else that wants a `Gralkor.Client` port) |
| `external/` | Foreground deployable (`serve.sh` + `Makefile` + `.env`) wrapping `ts/server/` for thin-client mode | Operators running gralkor as a standalone service; consumers point at it via `EXTERNAL_GRALKOR_URL` |

**Downstream harnesses live in sibling repos** and depend on the adapters above:

- `openclaw_gralkor` → [`@susu-eng/openclaw-gralkor`](https://www.npmjs.com/package/@susu-eng/openclaw-gralkor) — OpenClaw plugin (hooks + tools + native indexer).
- `jido_gralkor` → [`:jido_gralkor` on Hex](https://hex.pm/packages/jido_gralkor) — Jido plugin + ReAct tools.

## Architecture

The two adapters now have **fundamentally different shapes**. ts/ retains the HTTP-server architecture; ex/ embeds Python in the BEAM via Pythonx and skips HTTP entirely. The duplication is intentional — see TEST_TREES.md `## ts/ vs ex/ split`.

```
┌───────────────────────────────────────────────────────────────────────┐
│  Harness repos (OpenClaw plugin / Jido plugin / future integrations)  │
│                                                                       │
│   openclaw_gralkor ──→ @susu-eng/gralkor-ts (npm)                     │
│   jido_gralkor    ──→ :gralkor_ex (Hex)                               │
└───────────────────────────────┬───────────────────────────────────────┘
                                │    Gralkor.Client / GralkorClient port
                ┌───────────────┴───────────────┐
                ▼                               ▼
┌───────────────────────────────┐  ┌──────────────────────────────────┐
│  ex/   — :gralkor_ex          │  │  ts/  — @susu-eng/gralkor-ts     │
│                               │  │                                  │
│  In-process. No HTTP.         │  │  HTTP adapter (fetch),           │
│  Pythonx hosts CPython in     │  │  in-memory twin, boot gate,      │
│  the BEAM; graphiti runs      │  │  spawner. Bundles server/ at     │
│  there. LLM via req_llm in    │  │  publish time and spawns it      │
│  Elixir.                      │  │  as a child (or talks to an      │
│                               │  │  external one via               │
│  Owns full pipeline:          │  │  EXTERNAL_GRALKOR_URL).         │
│  CaptureBuffer, Distill,      │  └─────────────┬────────────────────┘
│  Interpret, Recall, Format,   │                │
│  GraphitiPool.                │                │ loopback HTTP
│                               │                │ (127.0.0.1:4000)
│                               │                ▼
│                               │  ┌──────────────────────────────────┐
│                               │  │  server/ — Python FastAPI        │
│                               │  │                                  │
│                               │  │  Graphiti + falkordblite         │
│                               │  │  Owns: capture buffer, distill,  │
│                               │  │  interpret, recall composition,  │
│                               │  │  per-group Graphiti, rate-limit  │
│                               │  │  passthrough, shutdown flush.    │
│                               │  │                                  │
│                               │  │  ts/ only — ex/ does not use it. │
│  ▼                            │  └──────────────────────────────────┘
│  Pythonx runtime (CPython     │
│  in the BEAM) ── graphiti_core│
│  ── AsyncFalkorDB (redislite  │
│  spawns redis-server child).  │
└───────────────────────────────┘
```

**Ownership split.** For ts/, the server owns all memory behaviour and adapters are thin HTTP clients. For ex/, the **same memory behaviour is reimplemented in Elixir** (see `ex/lib/gralkor/{capture_buffer,distill,interpret,recall,format}.ex`); graphiti is reached via Pythonx, and LLM calls outside graphiti's internals go through req_llm directly from Elixir. Two stacks satisfy the same `Gralkor.Client` / `GralkorClient` port contract via their respective shared port-contract suites.

**Operating modes — ts/ only.** The Python server can run two ways:

- **Local-spawn (default).** ts adapter spawns `server/` as a managed child via `createServerManager`. Loopback-only HTTP, no auth, lifetime tied to the consumer. Selected by setting `dataDir` in the TS pluginConfig.
- **Thin-client.** ts adapter skips the spawn and talks HTTP to a separately-running server (e.g. one packaged by `external/serve.sh`). Selected by setting `EXTERNAL_GRALKOR_URL`.

`:gralkor_ex` has only one mode — embedded in-process via Pythonx. Consumers opt in by setting `GRALKOR_DATA_DIR`; if unset, `:gralkor_ex` starts no children and `Gralkor.Client.*` will crash on use.

**Server location — ts/ only.** The Python server lives in-tree at `ts/server/` and ships directly in the npm tarball (no copy step). The ex/ adapter has no Python server (Pythonx materialises its own venv via uv on first boot — graphiti-core and falkordblite install from PyPI into a cache under `~/Library/Caches/pythonx/...`).

## Python server (`ts/server/`)

FastAPI app in `main.py`. Pipelines live under `ts/server/pipelines/`.

- `pipelines/formatting.py` — `format_fact`, `format_node`, `format_timestamp`.
- `pipelines/messages.py` — canonical `Message` Pydantic model (role ∈ `{"user", "assistant", "behaviour"}`, `content: str`). Single shape crossing the port; roles `user` / `assistant` are transcript text, `behaviour` is whatever harness-internal activity the adapter rolled up (thinking, tool calls, tool results) rendered as a string.
- `pipelines/interpret.py` — `interpret_facts(messages, facts_text, llm_client)` + `build_interpretation_context` (token-budgeted; oldest dropped first, role labels applied). Pydantic `InterpretResult` as `response_model` so all providers (Gemini/OpenAI/Anthropic/Groq) return `{"text": …}` consistently.
- `pipelines/distill.py` — `format_transcript(turns, llm_client)`, `safe_distill`. Uses `DistillResult` response_model. Input is `list[list[Message]]` — a list of turns, each turn a list of canonical Messages; the distiller reads any `behaviour` messages per turn and rolls them into a first-person past-tense summary.
- `pipelines/capture_buffer.py` — asyncio `CaptureBuffer` keyed by `session_id`. Holds turns until an explicit flush; the server has no idle-flush policy (session lifetime is owned by the consumer — see susu-2's `ChatAgent` terminate hook). Retry schedule 1s/2s/4s (4xx not retried via `CaptureClientError`), `flush_all` drains on lifespan shutdown. `flush(session_id)` schedules the retry-backed flush — used by `/session_end`.

Endpoints:

| Endpoint | Shape | Notes |
|---|---|---|
| `GET /health` | `200` when graph reachable | Consumers poll during boot; adapters disable client-side retry so failures surface fast |
| `POST /recall` | `{session_id, group_id, query, max_results}` → `{memory_block}` | Fast search → interpret filters to `relevantFacts: string[]` (each: fact + why relevant) → `<gralkor-memory trust="untrusted">` wraps the joined entries. No relevant facts (search empty or LLM filtered everything) → wrapped block with body `"No relevant memories found."` |
| `POST /distill` | `{turns: [[{role, content}, …], …]}` → `{episode_body}` | Parallel distillation via `asyncio.gather`; silent drop per turn on LLM failure |
| `POST /capture` | `{session_id, group_id, messages: [{role, content}, …]}` → `204` | Appends the message list to `capture_buffer` keyed by `session_id` (binds `group_id` on first append). Flush is consumer-driven — fires on `/session_end` or lifespan shutdown via `format_transcript` → `graphiti.add_episode` under bound `group_id` |
| `POST /session_end` | `{session_id}` → `204` | Schedules a retry-backed flush of the buffered turns. Returns 204 without awaiting the graph write (fire-and-forget at every layer) |
| `POST /tools/memory_add` | `{group_id, content, source_description?}` → `{"status":"stored"}` | Wraps `/episodes` with `source=EpisodeType.text`; auto-generates `name` + `idempotency_key` |
| `POST /build-indices` | `{}` → `{"status": string}` | Admin — operates on the whole graph |
| `POST /build-communities` | `{group_id}` → `{"communities": N, "edges": N}` | Admin — expensive per-group operation |
| `POST /search` | Underlying Graphiti search | Used internally by `/recall` |
| `POST /episodes` | Underlying Graphiti episode ingest | Used internally by `/capture` flush and `/tools/memory_add` |

**Session keying rationale.** The server holds the in-flight conversation in `CaptureBuffer`, keyed by `session_id` (not `group_id`). One principal / group can run many concurrent sessions, so coarser keying would cross-contaminate the interpretation window. Adapters generate `session_id` (UUID-shaped), pass it on `/capture` to write and on `/recall` to read.

**Auth.** None — the server has no authn at any endpoint. In **local-spawn** mode the consumer's own supervision tree (`Gralkor.Server` in ex/, `createServerManager` in ts/) binds it to `127.0.0.1`, so the only reachable caller is the consumer itself. In **thin-client** mode, `external/serve.sh` binds `0.0.0.0` — safe only on loopback or a trusted network; any non-loopback deployment (e.g. GCP) must front it with an authn layer (IAP / Cloud Endpoints / auth proxy).

**Graceful shutdown.** FastAPI lifespan awaits `capture_buffer.flush_all()` before `graphiti.close()`. Uvicorn is launched with `--timeout-graceful-shutdown 30` so pending flushes complete before SIGKILL.

**Boot warmup.** Before `yield`, lifespan runs one `graphiti.search` and one `interpret_facts` against a throwaway group/query to pay graphiti's cold-start cost (observed ~10 s on first `search`) before the health poll succeeds. Best-effort: any failure is logged at `:warning` and boot continues. Consumers see a longer boot window but a warm first `/recall`.

**LLM provider note.** Only Gemini's `generate_response(..., response_model=None)` returns `{"content": raw}`; OpenAI/Anthropic/Groq all coerce output to JSON/tool-use. Pass a Pydantic `response_model` to stay portable — see `pipelines/interpret.py` and `pipelines/distill.py`.

**Per-group Graphiti.** A `Graphiti` instance owns a driver pointed at one FalkorDB graph. `add_episode()` mutates `self.driver` in place when its `group_id` differs from the driver's current database (graphiti.py:887-889), which would race across concurrent requests for different groups if one `Graphiti` were shared. `main.py` keeps one `Graphiti` per group_id in `_graphiti_instances` (via `_graphiti_for(group_id)`, lazy on first use, no eviction): pinning each instance to one group_id keeps the clone branch inert, so concurrent calls for the same or different groups proceed independently with no driver lock. The underlying `AsyncFalkorDB` connection, LLM client, embedder, and cross-encoder are module-level shared resources.

**Model defaults — single source of truth.** `ts/server/main.py` holds `DEFAULT_LLM_PROVIDER="gemini"`, `DEFAULT_LLM_MODEL="gemini-3.1-flash-lite-preview"`, `DEFAULT_EMBEDDER_PROVIDER="gemini"`, `DEFAULT_EMBEDDER_MODEL="gemini-embedding-2-preview"`. Any adapter writes `config.yaml` with provider/model omitted and lets the server fill in.

## Elixir adapter (`ex/`)

Published as `:gralkor_ex` on Hex. **No HTTP, no Python server child** — the adapter embeds CPython in the BEAM via [Pythonx](https://github.com/livebook-dev/pythonx) and drives `graphiti-core` directly. LLM calls outside graphiti's internals go through [`req_llm`](https://github.com/agentjido/req_llm) in Elixir. Logic that lives in the Python server's pipelines (capture buffer, distill, interpret, recall composition) is duplicated in Elixir under `ex/lib/gralkor/`.

The server (`server/`) is now consumed by `@susu-eng/gralkor-ts` only.

Modules:

- `Gralkor.Client` — behaviour + `sanitize_group_id/1` + `impl/0` app-env resolver (defaults to `Gralkor.Client.Native`). Operations: `recall/3`, `capture/3`, `end_session/1`, `memory_add/3`, `build_indices/0`, `build_communities/1`. **No `health_check/0`** — the embedded runtime is ready by the time `Application.start/2` returns; runtime failures surface from the next call.
- `Gralkor.Client.Native` — production adapter. Wires `Recall` (for `recall/3`), `CaptureBuffer` (for `capture/3` + `end_session/1`), `GraphitiPool` (for `memory_add/3` + `build_indices/0` + `build_communities/1`), and req_llm (used inside Recall's interpret_fn and CaptureBuffer's distill flush_callback).
- `Gralkor.Client.InMemory` — test-only twin satisfying the shared port contract.
- `Gralkor.Python` — owns the PythonX runtime. Synchronous `init/1`: SIGKILLs orphan `redislite/bin/redis-server` processes, smoke-imports `graphiti_core`. Pythonx itself + venv materialisation happen at the `:pythonx` OTP app's start (config-driven via `:pythonx, :uv_init` in `config/config.exs`).
- `Gralkor.GraphitiPool` — owns the shared `AsyncFalkorDB` (which spawns a `redis-server` BEAM grandchild via `redislite`) and a per-`group_id` `Graphiti` instance cache. Cache is an ETS table read directly by callers; the GenServer only handles cache misses (via `GenServer.call`). The spike (`pythonx-spike/LEARNINGS.md`) showed Pythonx releases the GIL during graphiti's awaited I/O, so concurrent BEAM callers parallelise — serialising via GenServer would throw that away. Operations (`search/3`, `add_episode/3`, `build_indices/0`, `build_communities/1`) wrap `Pythonx.eval` blocks that call `asyncio.run(...)`.
- `Gralkor.CaptureBuffer` — in-flight conversation buffer keyed by `session_id`. `append/3`, `turns_for/1`, `flush/1`, `flush_all/0` (terminate awaits `flush_all`). Flush callback distils the buffered turns via `Distill.format_transcript/2` (req_llm) and ingests the episode via `GraphitiPool.add_episode/3`. Retry: server-internal failures back off 1s/2s/4s; 4xx and upstream-LLM errors drop without retry.
- `Gralkor.Recall` — orchestrator: `GraphitiPool.search` → `Interpret.interpret_facts` → wrap in `<gralkor-memory>`. 12s deadline (`Task.async` + `Task.yield`/`Task.shutdown`). Pure — accepts `search_fn` / `interpret_fn` / `turns_fn` so it can be tested without Pythonx.
- `Gralkor.Distill` — Elixir port of the server's `format_transcript`. `format_transcript/2` takes `[[Message]]` and a `distill_fn`. Behaviour-bearing turns are distilled in parallel via `Task.async_stream`; failures and `nil distill_fn` silently drop the behaviour line. `distill_schema/0` returns the NimbleOptions schema for the structured-output response.
- `Gralkor.Interpret` — Elixir port of the server's `interpret_facts` + `build_interpretation_context`. `interpret_schema/0` returns the schema (single `relevantFacts: [string]` field with the verbatim-copy doc).
- `Gralkor.Format` — pure formatting for graphiti edges. Mirrors the server's `pipelines/formatting.py` (`format_fact`, `format_facts`, `format_timestamp`) so consumer-visible fact text is identical across stacks.
- `Gralkor.Config` — env-driven: `GRALKOR_DATA_DIR` (required), `GRALKOR_LLM_MODEL` (optional, req_llm-style `"provider:model"`), `GRALKOR_EMBEDDER_MODEL` (optional). Single source of truth for default model selection.
- `Gralkor.Application` — supervises `Gralkor.Python` → `GraphitiPool` → `CaptureBuffer` (in order) when `GRALKOR_DATA_DIR` is set; empty children otherwise.

Deps: `pythonx`, `req_llm`, `jason`. No Jido dep — this is a bare OTP release consumed *by* Jido via `:jido_gralkor`.

The Python interpreter and venv are auto-materialised by Pythonx on first boot under `~/Library/Caches/pythonx/<version>/uv/<uv-version>/projects/<hash>/.venv` (or platform equivalent). First-ever uv sync is ~3s; subsequent boots cache to ~21ms.

Release via `pnpm run publish:ex -- patch|minor|major|current` from the monorepo root. Bumps `@version` in `ex/mix.exs`, runs `mix hex.publish --yes`, tags `gralkor-ex-v${version}`. Version stream is independent of the npm one.

## TypeScript adapter (`ts/`)

Published as `@susu-eng/gralkor-ts` on npm. Mirrors the Elixir adapter's port layout.

Modules:

- `src/client.ts` — `GralkorClient` port interface, canonical `Message` / `Role` types, `sanitizeGroupId()` helper.
- `src/client/http.ts` — `GralkorHttpClient` (fetch-based). Per-endpoint timeouts, `{ ok }` / `{ error }` result shape.
- `src/client/in-memory.ts` — `GralkorInMemoryClient`. Canned responses + call recording + `reset()`. Also exported from `@susu-eng/gralkor-ts/testing`.
- `src/connection.ts` — `waitForHealth(client, opts)`. Polls `healthCheck()` with backoff until healthy or timeout; throws on timeout.
- `src/server-manager.ts` — `createServerManager(opts)` spawns `uv run uvicorn main:app` as a managed child. **Liveness is detected exclusively from the child's `exit` event** — no post-boot health polling, mirroring `:gralkor_ex`'s Port-message invariant. On every spawn (boot and respawn) two reapers run first: any process bound to the configured port is killed (SIGTERM → wait 5s → SIGKILL → wait 2s → fail), and any `redislite/bin/redis-server` grandchild left over from a prior incarnation is SIGKILLed (matched by argv substring; safe to nuke unconditionally because this runs before our own spawn). Ports and that path are reserved for us; no pidfile, no adoption, no foreign-process discrimination. On unexpected `exit` (with the `stopping` flag false, i.e. not from `stop()`), the manager re-runs the spawn-and-health-poll path — the same shape `:gralkor_ex` gets from its `:one_for_one` supervisor. Restart intensity is bounded: 4+ unexpected exits inside any 5s window calls `process.exit(1)` so the next-level supervisor (Docker `restart: unless-stopped` in `agents/`) escalates rather than livelocking. `buildConfigYaml(opts)` emits `llm:` / `embedder:` sections only when the consumer passes `llmConfig` / `embedderConfig` — otherwise the server applies its own defaults. On `linux/arm64`, resolves a prebuilt `falkordblite` wheel (bundled under `server/wheels/` or downloaded from GH Releases into `dataDir/wheels/`) because PyPI's arm64 sdist embeds x86-64 binaries on glibc < 2.39 hosts.
- `src/server-env.ts` — `buildSyncEnv`, `buildPipEnv`, `buildSpawnEnv` — consolidate env var wiring for the three uv invocations.
- `scripts/bundle-server.mjs` — pre-build step that copies `../server/` → `ts/server/`. Runs before `tsc` (via `"build": "pnpm run bundle-server && tsc"`).

The shared port contract (`GralkorClient`) is reified by `test/contract/gralkor-client.contract.ts` — imported by both the HTTP and in-memory adapter test files.

Release via `pnpm run publish:ts -- patch|minor|major|current` from the monorepo root. Bumps `version` in `ts/package.json`, runs `pnpm publish`, tags `gralkor-ts-v${version}`.

## Test trees

Full contract in [TEST_TREES.md](./TEST_TREES.md). Sections:

- **Recall** — server-side `/recall` endpoint + `interpret-facts` pipeline.
- **Capture** — server-side `/distill`, `/capture`, `/session_end`, `capture-buffer`, `turns_to_conversation`, `format-transcript`.
- **Tools** — server-side `/tools/memory_add`, `/build-indices`, `/build-communities`.
- **Startup** — `ex-application`, `ex-server-lifecycle`, `ex-config-writing`, `ts-server-manager`, `ts-bundle-server`.
- **Configuration** — `validateOntologyConfig` (ts/), `server-config-defaults`, `cross-encoder-selection`.
- **Operations** — `/health`, `rate-limit-retry`, `downstream-error-handling`.
- **Timeouts** — `client-timeouts` (shared adapter contract: non-2xx and transport errors surface immediately with no L3 retry, per-endpoint receive windows, admin-no-deadline).
- **Elixir Client** — `ex-client`, `ex-sanitize-group-id`, `ex-impl-resolver`, `ex-client-http`, `ex-client-in-memory`, `ex-connection`, `ex-orphan-reaper`.
- **TypeScript Client** — mirror of the Elixir Client section for `ts/`.
- **Functional Journey** — `jido-memory-journey` (local-spawn end-to-end via `Gralkor.Server`); `external-thin-client-journey` (thin-client end-to-end via `external/serve.sh` fixture).
- **External deployment** — `external-local-runnable` (the deployable's contract; verified end-to-end by `external-thin-client-journey`).
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
