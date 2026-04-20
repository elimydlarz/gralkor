# Migration: TS side → Python-server-heavy architecture

Mirror the Elixir-side three-way split onto the TS/OpenClaw side. The Python server owns state (capture buffer, distillation, interpretation); the adapters wrap it for each language ecosystem and internalise the Python source at their own build time; harness-specific glue depends on the adapter and never touches the Python source directly.

## Target structure

| Package | Location | Role | Ships Python server? | Status |
|---|---|---|---|---|
| Python core | `gralkor/server/` | FalkorDB + Graphiti behind FastAPI. Owns capture buffer, distill, interpret. Never published as a standalone artifact. | (source of truth) | Complete. |
| Hex `:gralkor_ex` | `gralkor/ex/` | Elixir adapter. `Gralkor.Client` port, HTTP adapter, InMemory twin, Connection, Server supervisor, OrphanReaper. **Package name**: `:gralkor_ex` (rename from `:gralkor`). **Module namespace**: `Gralkor.*` (unchanged — matches Elixir convention of package name ≠ module). | **Yes — internalised at build.** `compile.gralkor_priv` copies `gralkor/server/` → `ex/priv/server/` during `mix hex.publish`. `priv/` in `:files`. | `:gralkor@1.2.0` published. Rename pending. |
| npm `@susu-eng/gralkor-ts` | `gralkor/ts/` | TS adapter. `GralkorClient` interface, HTTP adapter, InMemory twin, server-manager, Connection. | **Yes — internalised at build.** Pre-build step copies `../server/` → `ts/dist/server/` (or similar). `files:` ships it. `createServerManager`'s default `serverDir` resolves to the bundled path. | `0.2.0` published (without server bundling — bug). `0.3.0` will fix. |
| Hex `:jido_gralkor` | `jido_gralkor/` repo | Jido-on-BEAM harness. Depends on `:gralkor_ex`. | **No** — server comes in via `:gralkor_ex`'s `priv/server/`. | `0.2.0` published (still on `:gralkor`). Update to `:gralkor_ex` at next bump. |
| npm `@susu-eng/openclaw-gralkor` | `openclaw_gralkor/` repo | OpenClaw harness. Depends on `@susu-eng/gralkor-ts`. | **No** — server comes in via `gralkor-ts`'s bundled path; `openclaw-gralkor`'s `files:` does not list `server/`. | `1.0.0` scaffolded locally (wrongly bundles server copy). Fix before publish. |

## Naming

All five packages follow the core→adapter→harness symmetry. Every dependency arrow points from harness → adapter → (adapter-internalised core):

- Hex: `:jido_gralkor` → `:gralkor_ex` → (priv/server bundled at build)
- npm: `@susu-eng/openclaw-gralkor` → `@susu-eng/gralkor-ts` → (dist/server bundled at build)

Package-name suffixes (`_ex`, `-ts`) live at package level; module names stay unsuffixed (`Gralkor.Client`, `GralkorClient`) — matches Elixir/TS conventions.

## The architectural win

The Python server owns what used to be client-side: capture buffer (session-keyed append, idle flush, session_end flush, 3× retry), behaviour distillation (per-turn), recall interpretation. Client-side artifacts that disappear from TS: `DebouncedFlush` (~55 LoC), `flushSessionBuffer` (~70), `distill.ts` (~130), `llm-client.ts` (~145), `SessionBuffer` + message cache, SIGTERM flush handler. Net: `hooks.ts` shrinks from ~673 LoC to ~80 across three hook files.

## Step sequencing

### Step 1 — `gralkor/ts/` package — DONE AT 0.2.0 (server not bundled — bug)

1. ✅ Test trees, scaffold, contract suite, client interface + HTTP adapter + InMemory twin, server-manager port, connection helper.
2. ✅ `@susu-eng/gralkor-ts@0.1.0` published.
3. ✅ `@susu-eng/gralkor-ts@0.2.0` published (adds `buildIndices` + `buildCommunities`).
4. ❌ Server was NOT bundled. This contradicted the target architecture.

### Step 2 — `openclaw_gralkor/` repo — DONE AT 1.0.0 LOCALLY (wrongly bundles server)

1. ✅ Local scaffold, hooks + tools + session-map + ctx-to-turn + native-indexer, four tools including the two DO-NOT-CALL admin tools.
2. ✅ 48/48 tests green locally.
3. ❌ Repo committed `server/` directly — should have come via gralkor-ts dep.
4. ❌ Not yet published.

### Step 3 — Bundle server in gralkor-ts → republish downstream

1. Add a pre-build step to `gralkor/ts/`: copy `../server/` → `ts/dist/server/` (with `.venv`/`__pycache__`/`wheels`/`tests` exclusions matching `compile.gralkor_priv`). Gitignore `ts/dist/`.
2. Update `createServerManager` default `serverDir`: resolve to the bundled path relative to the installed `gralkor-ts` package. Callers who don't override `serverDir` get the bundled server automatically.
3. Add `server/*` paths (under the bundled dir) to `ts/package.json`'s `files:` so they ship in the npm tarball.
4. **PAUSE — user publishes `@susu-eng/gralkor-ts@0.3.0`.** Minor bump — additive on its own surface (adds shipping + default serverDir); no breaking change to existing call sites.
5. In `openclaw_gralkor/`: delete `server/` from the working tree, add `server/` to `.gitignore`, remove `server/*` entries from `package.json`'s `files:`, and drop the `serverDir: join(pluginDir, "server")` override in `register.ts` so `createServerManager` uses gralkor-ts's bundled default.
6. Bump `openclaw_gralkor` to `@susu-eng/openclaw-gralkor@1.1.0`, dep on `@susu-eng/gralkor-ts@^0.3.0`.
7. **PAUSE — user publishes `@susu-eng/openclaw-gralkor@1.1.0` to npm + clawhub.**

### Step 4 — Rename Hex `:gralkor` → `:gralkor_ex`

1. `gralkor/ex/mix.exs`: change `app: :gralkor` → `app: :gralkor_ex`. Bump `@version` to `1.3.0`.
2. Module namespace stays `Gralkor.*` (no forced module rename — Hex package name ≠ module name is idiomatic).
3. Any internal references to `Application.get_env(:gralkor, ...)` → `Application.get_env(:gralkor_ex, ...)` where applicable. (Check: config keys use `:gralkor` app name today; those migrate.)
4. **PAUSE — user publishes `:gralkor_ex@1.3.0` to Hex.**
5. `mix hex.retire gralkor 1.2.0 other --message "Renamed to :gralkor_ex for naming symmetry with @susu-eng/gralkor-ts on npm. Update deps to {:gralkor_ex, \"~> 1.3\"}."` (retires the latest, optionally all versions).
6. In `jido_gralkor/mix.exs`: dep `{:gralkor, "~> 1.2"}` → `{:gralkor_ex, "~> 1.3"}`. Any `Application.get_env(:gralkor, ...)` reads update too. Bump `jido_gralkor` to `0.3.0`. Publish.
7. In `susu-2/mix.exs`: dep `{:gralkor, "~> 1.2"}` → `{:gralkor_ex, "~> 1.3"}`. Any direct `Gralkor.Client.*` call sites (e.g. `reset_session`'s `Client.impl().end_session(...)`) stay unchanged (module namespace is the same). Config keys update: `:gralkor, :client_http` → `:gralkor_ex, :client_http`, etc. Run tests.

### Step 5 — Deprecation stub of old npm `@susu-eng/gralkor` + gralkor root cleanup

1. Publish a final `@susu-eng/gralkor` release that is a **stub**: entry point throws with a clear message pointing operators at `@susu-eng/openclaw-gralkor`. `npm deprecate @susu-eng/gralkor "moved to @susu-eng/openclaw-gralkor"`.
2. Delete from `gralkor/` root (all OpenClaw-plugin infra that moved to `openclaw_gralkor/`): `src/`, `openclaw.plugin.json`, `.clawhubignore`, `.env.example`, `config.yaml`, any `.npmignore`, `scripts/publish-npm.sh`, `publish-clawhub.sh`, `publish-all.sh`, `pack.sh`, `build-arm64-wheel.sh`, `test/integration/publish-npm.integration.test.ts`, `test/integration/publish-clawhub.integration.test.ts`, `publish-all.integration.test.ts`, `test/harness/`, root `stryker.config.mjs`, root `vitest.config.ts`, root `vitest.stryker.config.ts`, root `tsconfig.json`.
3. Trim root `package.json`: drop openclaw manifest, `dependencies`, `peerDependencies`, all `publish:npm`/`publish:clawhub`/`publish:all`/`test:*`/`pack`/`setup:server`/`test:mutate` scripts. Keep just `publish:ex`, `publish:ts`. Or delete `package.json` entirely.
4. Prune migrated trees from `gralkor/TEST_TREES.md`: client-side buffering, distillation, SIGTERM-flush, OpenClaw tool wrappers, auto-recall client plumbing, native-indexer, `publish-npm`, `publish-clawhub`, `publish-all`, `bundled-wheel-arch-selection`, `secret-resolution`. Server-side trees stay (capture-buffer, `/capture`, `/session_end`, `/distill`, `/recall`, `/tools/memory_*`, `/health`, Python-side trees). Precise list finalised while executing.
5. Rewrite `gralkor/README.md` for the new topology (server + ex + ts + pointers to harness packages).
6. Delete `MIGRATION_PLAN.md` (job done).

### Step 6 — `agents/`

1. `openclaw plugins install @susu-eng/openclaw-gralkor` (new name). Drop `@susu-eng/gralkor`.

## Risks / open questions

1. **clawhub pipeline cross-repo dependency.** `publish-clawhub.sh` uploads the arm64 wheel to a GitHub Release. Whose repo? Currently it's `gralkor`'s. Post-migration: openclaw_gralkor owns the publish but the wheel itself has no natural home because the Python source lives elsewhere. Options: (a) move the wheel-build step under `gralkor-ts`'s pre-publish (wheel ships inside the npm tarball, no GitHub release needed); (b) keep the wheel upload in gralkor as a manual step before the openclaw_gralkor publish. (a) is cleaner — aligns with "gralkor-ts internalises the Python pieces".
2. **Retiring Hex `:gralkor`.** `mix hex.retire` accepts a reason; no stub-package mechanism like npm. Consumers (jido_gralkor, susu-2) need dep rename. Only two consumers, both ours.
3. **Module-name migration pressure.** I'm keeping `Gralkor.*` module names even after the Hex package becomes `:gralkor_ex`. If future drift wants the module name to match too (`GralkorEx.*`), it's a bigger breaking rename. Decided: not doing it — Elixir convention is package-name ≠ module-name.

## Done definition

- `gralkor/ts/` publishes `@susu-eng/gralkor-ts@0.3.0` shipping the Python server bundled at build time.
- `openclaw_gralkor/` publishes `@susu-eng/openclaw-gralkor@1.1.0`, no bundled `server/`, inherits server from gralkor-ts.
- `gralkor/ex/` publishes `:gralkor_ex@1.3.0`; old `:gralkor` retired on Hex.
- `jido_gralkor` publishes `0.3.0` depending on `:gralkor_ex`.
- `susu-2/mix.exs` on `:gralkor_ex`.
- Final stub release of `@susu-eng/gralkor` npm published and `npm deprecate`-ed.
- `gralkor/src/` gone; root is just `server/` + `ex/` + `ts/` + monorepo scaffolding.
- `gralkor/TEST_TREES.md` is server + ex + ts only.
- `gralkor/README.md` reflects the new topology.
- `agents/` on `@susu-eng/openclaw-gralkor`.
- All suites green: `gralkor/ex` (70+), `jido_gralkor` (28+), `gralkor/ts` (50+), `openclaw_gralkor` (48+).
