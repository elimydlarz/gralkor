# Migration: TS side → Python-server-heavy architecture

Mirror the Elixir-side three-way split onto the TS/OpenClaw side. The Python server owns state (capture buffer, distillation, interpretation); the TS client is a thin HTTP wrapper; OpenClaw-specific glue lives in its own repo.

## Target structure

| Package | Location | Role | Status |
|---|---|---|---|
| Python core | `gralkor/server/` | FalkorDB + Graphiti behind FastAPI. Owns capture buffer, distill, interpret. | Already complete. No changes. |
| `:gralkor` (Hex) | `gralkor/ex/` | Elixir adapter: `Gralkor.Client` port, HTTP adapter, InMemory twin, Connection, Server supervisor, OrphanReaper. | Complete at v1.1. |
| `@susu-eng/gralkor-ts` (npm) | `gralkor/ts/` | **NEW.** TS adapter: `GralkorClient` interface, HTTP adapter, InMemory twin, server-manager, Connection (waitForHealth). Mirrors `ex/` exactly. | To build. |
| `:jido_gralkor` (Hex) | `jido_gralkor/` repo | Jido connectors. | Complete at v0.1. |
| `@susu-eng/gralkor` (npm) | `openclaw_gralkor/` repo | **NEW repo (renamed from this one's root).** OpenClaw plugin: manifest, hooks, tools, CLI. Depends on `@susu-eng/gralkor-ts`. | To build. |

## Naming

- **npm plugin name stays `@susu-eng/gralkor`** — zero operator impact on existing `openclaw plugins install` commands.
- **TS client is `@susu-eng/gralkor-ts`** — asymmetric with Hex's `:gralkor` / `:jido_gralkor` symmetry, but the asymmetry reflects reality: on npm, the plugin name `@susu-eng/gralkor` is taken by the OpenClaw plugin.
- Inside the gralkor monorepo, symmetry holds: `ex/` → Hex `:gralkor`, `ts/` → npm `@susu-eng/gralkor-ts`.
- Repo name: `openclaw_gralkor` (matches `jido_gralkor`).

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
- SIGTERM flush handler.

Net: current `hooks.ts` (~673 lines) collapses to ~80 lines across three hook files in `openclaw_gralkor`.

## Step sequencing

Trees first per `/change`; implementation follows trees per `/tdd`.

### Step 1 — `gralkor/ts/` package

1. Add `## TypeScript Client` section to `gralkor/TEST_TREES.md`: `ts-client` (port contract), `ts-sanitize-group-id`, `ts-client-http`, `ts-client-in-memory`, `ts-connection`. Port verbatim from the `ex-*` trees — same invariants.
2. Scaffold `gralkor/ts/` with `package.json` (name `@susu-eng/gralkor-ts`), `tsconfig.json`, `vitest.config.ts`, `src/`, `test/`.
3. Implement the shared contract suite in `test/contract/gralkor-client.contract.ts` (vitest `describe` factory; both adapter tests import it).
4. Implement `src/client.ts` (`GralkorClient` interface + `sanitizeGroupId`).
5. Implement `src/client/http.ts` (`GralkorHttpClient`) — port from current `src/client.ts`, simplify to match Elixir Client surface. Methods: `recall`, `capture`, `endSession`, `memorySearch`, `memoryAdd`, `buildIndices`, `buildCommunities`, `healthCheck`.
6. Implement `src/client/in-memory.ts` — canned responses + call recording + reset.
7. Port `src/server-manager.ts` + `src/server-env.ts` from current `src/`.
8. Implement `src/connection.ts` — `waitForHealth(client, opts)` mirror of `Gralkor.Connection`.
9. Run vitest, confirm green.
10. **PAUSE for user to publish `@susu-eng/gralkor-ts@0.1.0` to npm.**

### Step 2 — `openclaw_gralkor/` repo

1. `gh repo create openclaw_gralkor --public --description "OpenClaw plugin wrapper around @susu-eng/gralkor-ts" --source . --push` (after scaffold).
2. Scaffold `package.json` with name `@susu-eng/gralkor` (unchanged operator-facing name) and dep on `@susu-eng/gralkor-ts`.
3. Add `CLAUDE.md` with `## Test Trees` — simplified hooks (`before_prompt_build`, `agent_end`, `session_end`), four tool wrappers, session-map, native-indexer. Existing `createAgentEndHandler`, `DebouncedFlush`, `flushSessionBuffer`, `sigterm-flush` trees in `gralkor/TEST_TREES.md` are deleted in Step 3; server-side trees (`capture-buffer`, `POST /capture`, `POST /session_end`, `POST /distill`) already cover all that behaviour.
4. Port `openclaw.plugin.json`, `publish-npm.sh`, `publish-clawhub.sh`, `.clawhubignore`, `publish-all.sh` from gralkor root.
5. Port + simplify `src/hooks/{before_prompt_build,agent_end,session_end}.ts`, `src/tools/*.ts`, `src/session-map.ts`, `src/native-indexer.ts`, `src/index.ts`, `src/register.ts`.
6. Tests: vitest against `gralkor-ts`'s `InMemoryClient` for all hook/tool behaviour.
7. **PAUSE for user to publish `@susu-eng/gralkor@X.Y.Z` to npm + clawhub.**

### Step 3 — Clean up gralkor root

1. Delete `src/`, `openclaw.plugin.json`, `.clawhubignore`, `publish-npm.sh`, `publish-clawhub.sh`, `publish-all.sh`, and relevant bits of `package.json` (keep anything still needed for the pnpm workspace, or remove the workspace concept if it's now just `ts/`).
2. Delete migrated trees from `gralkor/TEST_TREES.md`: `createAgentEndHandler`, `DebouncedFlush`, `flushSessionBuffer`, `sigterm-flush`, `memory_build_indices tool`, `memory_build_communities tool`, `POST /tools/memory_search`, `POST /tools/memory_add`, `bundled-wheel-arch-selection`, `secret-resolution`, `native-memory-indexing`, `extractInjectQuery`, `auto-recall-further-querying`, `auto-recall-search-strategy`, `unified-search`. Some of these are server-side and stay; others were TS-client/harness behaviour and move with the code. Precise list to be finalised in Step 3.
3. Update `gralkor/README.md`: describe the monorepo (server + ex + ts), point OpenClaw users at `openclaw_gralkor`, Jido users at `jido_gralkor`, non-Jido Elixir users at `ex/README.md`, non-OpenClaw TS users at `ts/README.md`.

## Risks / open questions

1. **Per-turn mapping.** OpenClaw's `agent_end` ctx carries a list of messages; `/capture` wants one turn `{user_query, assistant_answer, events}`. Need `ctxToTurn()` helper in `openclaw_gralkor`. Own tree.
2. **Native-indexer API fit.** Currently uses `client.addEpisode()`; post-migration uses `client.memoryAdd()`. Confirm `memoryAdd` accepts the required payload shape (it does per the existing `POST /tools/memory_add` tree).
3. **clawhub pipeline cross-repo dependency.** `publish-clawhub.sh` uploads the arm64 wheel to a GitHub Release in the `gralkor` repo. The script moves to `openclaw_gralkor` but still needs to trigger the gralkor-repo release upload. Options: (a) keep the wheel upload in gralkor as a separate manual step invoked before publishing openclaw_gralkor; (b) publish wheels as `@susu-eng/gralkor-wheels-arm64` npm package. (b) is cleaner but more invasive — revisit during Step 3.
4. **Test fixtures.** `test/fixtures/fake_gralkor.py` is shared between TS tests (current) and Ex tests (now has its own copy in `ex/test/fixtures/`). `gralkor/ts/` tests can use `InMemoryClient` for unit tests; fixture-based integration tests can share the existing Python fixture or duplicate as needed.

## Done definition

- `gralkor/ts/` publishes to npm as `@susu-eng/gralkor-ts`, passes full vitest suite, mirrors `ex/`'s Client/HTTP/InMemory/Connection behaviour.
- `openclaw_gralkor/` is a standalone repo, publishes `@susu-eng/gralkor` to npm + clawhub, passes its own vitest suite, depends on `@susu-eng/gralkor-ts`.
- Current `gralkor/src/` is gone; `gralkor/TEST_TREES.md` contains only server + ex + ts trees; OpenClaw-specific trees live in `openclaw_gralkor/CLAUDE.md`.
- `gralkor/README.md` reflects the new topology.
- All three test suites green: `gralkor/ex` (62), `jido_gralkor` (22), `gralkor/ts` (~44 projected), `openclaw_gralkor` (~50 projected).
