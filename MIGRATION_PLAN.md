# Migration: TS side → Python-server-heavy architecture

Mirror the Elixir-side three-way split onto the TS/OpenClaw side. The Python server owns state (capture buffer, distillation, interpretation); the adapters wrap it for each language ecosystem; harness-specific glue lives in its own package.

## Target structure

| Package | Location | Role | Ships Python server? | Status |
|---|---|---|---|---|
| Python core | `gralkor/server/` | FalkorDB + Graphiti behind FastAPI. Owns capture buffer, distill, interpret. | (source of truth) | Complete. |
| `:gralkor` (Hex) | `gralkor/ex/` | Elixir adapter: `Gralkor.Client` port, HTTP adapter, InMemory twin, Connection, Server supervisor, OrphanReaper. | Yes — bundled into `priv/server/` by a custom `:gralkor_priv` compiler at build time. | Complete at v1.1. |
| `@susu-eng/gralkor-ts` (npm) | `gralkor/ts/` | **NEW.** TS adapter: `GralkorClient` interface, HTTP adapter, InMemory twin, server-manager (accepts `serverDir` from caller), Connection (waitForHealth). Mirrors `ex/`. | **No.** Pure client library; the consumer supplies the server dir path to `createServerManager`. | Built, 42 tests green. Awaiting publish. |
| `:jido_gralkor` (Hex) | `jido_gralkor/` repo | Jido-on-BEAM harness. | No — depends on `:gralkor` which already ships the server. | Complete at v0.1. |
| `@susu-eng/openclaw-gralkor` (npm) | `openclaw_gralkor/` repo | **NEW repo — OpenClaw harness.** Plugin manifest, hooks, tools, CLI. Depends on `@susu-eng/gralkor-ts`. | **Yes** — bundles `server/` (the consumer-installs-via-clawhub side, parallel to what `:gralkor` Hex does with `priv/server/`). | To build. |

## Naming

All five packages now follow the core→adapter→harness symmetry. Each dependency arrow points from harness to adapter:

- Hex: `:jido_gralkor` → `:gralkor` (adapter) → (Python core via `priv/server`)
- npm: `@susu-eng/openclaw-gralkor` → `@susu-eng/gralkor-ts` (adapter) → (Python core via the harness's own `server/`)

The earlier proposal to keep the existing npm name (`@susu-eng/gralkor`) for the OpenClaw plugin is **rescinded**. That name falsely implied the plugin was the core and created a "core depends on adapter" smell when we said the plugin would depend on `gralkor-ts`. Renaming aligns the npm side with the Hex side. Cost: one rename in `agents/`'s install command.

## Deprecation / transition plan for the npm rename

1. `openclaw_gralkor` v1.0.0 publishes as `@susu-eng/openclaw-gralkor` — first release after the rename.
2. Publish a final `@susu-eng/gralkor` release that is a **stub package**: its entry point `throw`s with a clear message — `"@susu-eng/gralkor has been renamed to @susu-eng/openclaw-gralkor. Run: openclaw plugins install @susu-eng/openclaw-gralkor"`. Tag it as `latest` on npm, then `npm deprecate @susu-eng/gralkor "moved to @susu-eng/openclaw-gralkor"`.
3. Operators who run `openclaw plugins update gralkor@latest` get the stub, see the message, reinstall under the new name.
4. `agents/` migrates by running the new install command once.

## What moves server-side (the architectural win)

Python server already implements (see existing trees in `TEST_TREES.md`):

- **Capture buffer** (`capture_buffer.py`) — session-keyed append, idle flush, session_end flush, 3× exponential-backoff retry.
- **Behaviour distillation** — per-turn via `/capture`; standalone `/distill` endpoint.
- **Recall interpretation** — `interpret_facts` inside `/recall`.

So the following disappear from the TS side:

- `DebouncedFlush` class (~55 lines) — client-side keyed debouncer.
- `flushSessionBuffer` (~70 lines) — transcript formatting + retry loop.
- `distill.ts` (~130 lines) — client-side transcript distillation.
- `llm-client.ts` (~145 lines) — client-side LLM abstraction.
- `SessionBuffer` + client-side message caching.
- SIGTERM flush handler (server's lifespan shutdown handles buffer flushing).

Net: current `hooks.ts` (~673 lines) collapses to ~80 lines across three hook files in `openclaw_gralkor`.

## Step sequencing

Trees first per `/change`; implementation follows trees per `/tdd`.

### Step 1 — `gralkor/ts/` package — DONE

1. ✅ `## TypeScript Client` section added to `gralkor/TEST_TREES.md`: `ts-client` (port contract), `ts-sanitize-group-id`, `ts-client-http`, `ts-client-in-memory`, `ts-connection`.
2. ✅ Scaffolded with `package.json` (name `@susu-eng/gralkor-ts`), `tsconfig.json`, `vitest.config.ts`.
3. ✅ Shared contract suite at `test/contract/gralkor-client.contract.ts`.
4. ✅ `src/client.ts` — `GralkorClient` interface + `Result<T, E>` + `sanitizeGroupId`.
5. ✅ `src/client/http.ts` — `GralkorHttpClient` with per-endpoint timeouts, no retry, no auth, throws on blank session_id.
6. ✅ `src/client/in-memory.ts` — `GralkorInMemoryClient` with call recording + `reset()`.
7. ✅ `src/server-manager.ts` + `src/server-env.ts` ported.
8. ✅ `src/connection.ts` — `waitForHealth()`.
9. ✅ 42/42 vitest green.
10. **PAUSE — user publishes `@susu-eng/gralkor-ts@0.1.0` to npm.** (Script `scripts/publish-ts.sh` to be added for future releases.)

### Step 2 — `openclaw_gralkor/` repo

1. `gh repo create openclaw_gralkor --public --description "OpenClaw plugin: long-term memory via Gralkor" --source . --push` (after scaffold).
2. Scaffold `package.json` with name `@susu-eng/openclaw-gralkor` and dep on `@susu-eng/gralkor-ts@^0.1.0`. Move `openclaw.plugin.json` from gralkor root into the new repo; update its `id` if needed.
3. Add `CLAUDE.md` with `## Test Trees`:
   - Hook trees: `before_prompt_build → POST /recall + inject`, `agent_end → POST /capture` (no client buffering), `session_end → POST /session_end`.
   - `ctxToTurn` tree (OpenClaw ctx → `{user_query, assistant_answer, events}` for `/capture`).
   - Four tool trees (`memory_search`, `memory_add`, `memory_build_indices`, `memory_build_communities`).
   - `session-map` tree.
   - `native-indexer` tree (minus the current `addEpisode` plumbing; calls `client.memoryAdd()`).
4. Port `publish-npm.sh`, `publish-clawhub.sh`, `.clawhubignore`, `publish-all.sh`, the `server/` directory (bundled for clawhub install), `scripts/build-arm64-wheel.sh`, `scripts/pack.sh` from gralkor root.
5. Port + simplify `src/index.ts`, `src/register.ts`, `src/hooks.ts` (split into three small files), `src/tools.ts`, `src/native-indexer.ts`. Use `@susu-eng/gralkor-ts`'s `GralkorHttpClient` + `createServerManager` + `waitForHealth`.
6. Delete entirely: `DebouncedFlush`, `flushSessionBuffer`, `distill.ts`, `llm-client.ts`, SIGTERM flush handler, client-side session-buffer state.
7. Tests: vitest against `GralkorInMemoryClient` for all hook/tool behaviour.
8. **PAUSE — user publishes `@susu-eng/openclaw-gralkor@1.0.0` to npm + clawhub.**

### Step 3 — Deprecate old `@susu-eng/gralkor` + clean up gralkor root

1. Publish a final stub release of `@susu-eng/gralkor` (next version after 27.2.15) that prints the rename message and exits; `npm deprecate` it.
2. Delete `src/`, `openclaw.plugin.json`, `.clawhubignore`, `publish-npm.sh`, `publish-clawhub.sh`, `publish-all.sh`, and anything else OpenClaw-specific from gralkor root (all moved to `openclaw_gralkor`). Keep `server/`, `ex/`, `ts/`.
3. Delete migrated trees from `gralkor/TEST_TREES.md`: those describing pre-migration client-side buffering, distillation, tool wrappers, auto-recall client plumbing, and any native-indexer behaviour that moved to `openclaw_gralkor`. Server-side trees (`capture-buffer`, `POST /capture`, `POST /session_end`, `POST /distill`, `POST /tools/memory_search`, `POST /tools/memory_add`, `/recall`, `/health`, Python-side `interpret-facts` and `message-clean`) stay. Precise deletion list finalised while executing Step 3.
4. Update `gralkor/README.md`: describe the monorepo (server + ex + ts) and point operators at the right harness package for each ecosystem.
5. Update `gralkor/ts/README.md`: line 5 points at `@susu-eng/openclaw-gralkor` (not `@susu-eng/gralkor`).

## Risks / open questions

1. **Per-turn mapping.** OpenClaw's `agent_end` ctx carries a list of messages; `/capture` wants one turn `{user_query, assistant_answer, events}`. `ctxToTurn()` helper in `openclaw_gralkor` handles this, driven by its own test tree.
2. **Native-indexer API fit.** Current uses `client.addEpisode()`; post-migration uses `client.memoryAdd()`. Payload shape already compatible per the existing `POST /tools/memory_add` tree.
3. **clawhub pipeline cross-repo dependency.** `publish-clawhub.sh` currently uploads the arm64 wheel to a GitHub Release in the `gralkor` repo. The script moves to `openclaw_gralkor` but still needs to trigger `gralkor`-repo release upload. Options: (a) keep the wheel upload in gralkor as a manual step invoked before publishing openclaw_gralkor; (b) publish wheels as a separate `@susu-eng/gralkor-wheels-arm64` npm package. (a) is easier; (b) is cleaner. Pick during Step 2.
4. **Test fixtures.** `test/fixtures/fake_gralkor.py` is shared between TS tests (current) and Ex tests (has its own copy in `ex/test/fixtures/`). `gralkor/ts/` unit tests use `InMemoryClient` only; any future fixture-based integration tests can share the existing Python fixture or duplicate. `openclaw_gralkor` similarly uses `InMemoryClient` for unit tests.

## Done definition

- `gralkor/ts/` publishes to npm as `@susu-eng/gralkor-ts`, passes full vitest suite, mirrors `ex/`'s port contract behaviour.
- `openclaw_gralkor/` is a standalone repo, publishes `@susu-eng/openclaw-gralkor` to npm + clawhub, passes its own vitest suite, depends on `@susu-eng/gralkor-ts`.
- Final stub release of `@susu-eng/gralkor` published and deprecated on npm.
- Current `gralkor/src/` is gone; `gralkor/TEST_TREES.md` contains only core (Python server), ex, and ts trees; OpenClaw-specific trees live in `openclaw_gralkor/CLAUDE.md`.
- `gralkor/README.md` reflects the new topology.
- `agents/` has run `openclaw plugins install @susu-eng/openclaw-gralkor` once.
- All four test suites green: `gralkor/ex` (62), `jido_gralkor` (22), `gralkor/ts` (42), `openclaw_gralkor` (~50 projected).
