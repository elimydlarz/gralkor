# Suggestions from a Gralkor Consumer

Feedback from the `agents` repo — an automated OpenClaw bootstrap that provisions Gralkor on a VPS via `init.sh` and Makefile targets.

## 1. Idempotent single-command install with upgrade and slot assignment

My `init.sh` is 30 lines of bash doing work Gralkor should own: scanning for tarballs, extracting semver from filenames, comparing against installed version, conditionally uninstalling/installing/enabling, and setting the memory slot. The migration from old plugin ID `memory-gralkor` to `gralkor` is another consumer burden.

**Want:** A single idempotent command:
```bash
openclaw plugins install /data/susu-eng-gralkor-memory-19.0.4.tgz --slot memory
```
That handles: same version installed (no-op), older version installed (upgrade in place), not installed (fresh install + enable + slot). If Gralkor knows its own lineage, it could handle the `memory-gralkor` migration on install too.

## 2. Config at install time or smarter defaults

After install, I run 4 separate `openclaw config set` calls for allowlist, LLM model, test mode, and skills.

**Want:** Accept config at install time:
```bash
openclaw plugins install /data/gralkor-19.0.4.tgz \
  --config '{"llm":{"model":"gemini-3.1-flash-lite-preview"},"test":true}'
```
Or: if the only reason I override `llm.model` is cost, let me set a cost-tier preference instead of a specific model name.

## 3. `uv` auto-install or clear error on missing

Gralkor needs `uv` on PATH before the gateway starts. My `init.sh` installs it, but Gralkor gives no error if `uv` is missing — the server-manager just fails during venv creation.

**Want:** Either bundle/auto-install `uv`, or fail with a clear message: `"Gralkor requires 'uv' on PATH. Install: curl -LsSf https://astral.sh/uv/install.sh | sh"`

## 4. Rich `gralkor status` output

`openclaw plugins info gralkor` tells me the plugin is loaded but not whether the Graphiti server is healthy or the graph is queryable. I end up grepping logs for diagnostics.

**Want:** `openclaw gralkor status` reporting:
- Server process state (running/stopped/starting)
- Health endpoint result (including FalkorDB connectivity)
- Graph stats (node count, edge count, last episode timestamp)
- Venv state (created/missing/stale)
- Data directory path

## 5. Stable tarball naming or registry install

My sync script extracts the plugin name from the tarball filename using regex. If Gralkor changes its package name, my version-dedup logic breaks silently.

**Want:** Either a stable, documented tarball naming convention that's part of Gralkor's contract, or support for registry install so I stop managing tarballs: `openclaw plugins install @susu-eng/gralkor@19.0.4`

## 6. Surface data directory in status

I document in three separate places that Gralkor's data lives at `/data/.openclaw/extensions/.gralkor-data/`. I learned this by reading Gralkor's source.

**Want:** `openclaw gralkor status` prints the data directory path. The `dataDir` config option should be prominently documented.

## 7. SIGTERM flush for auto-capture buffers

If the process terminates before the idle timeout (default 5 min) or session end, buffered messages are lost. `make oc-restart` kills the container, potentially losing the last conversation's capture. Docker sends SIGTERM with a 10s grace period before SIGKILL.

**Want:** A SIGTERM handler that flushes all pending session buffers before exit.

## 8. Config validation command

My `auth-status.sh` checks for any of `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` and reports Gralkor as "ready". But it doesn't know which provider Gralkor is configured to use. If I set `llm.provider: gemini` but only have `OPENAI_API_KEY`, auth says ready but Gralkor fails at runtime.

**Want:** `openclaw gralkor check` that validates: configured provider is X, required env var is Y, present: yes/no.

## Priority

| # | Improvement | Impact |
|---|-------------|--------|
| 1 | Idempotent install with upgrade/slot | Eliminates 30 lines of consumer init.sh |
| 2 | Config at install or smarter defaults | Eliminates 4 config-set calls |
| 3 | `uv` auto-install or clear error | Eliminates silent startup failure |
| 4 | Rich status output | Eliminates log-grepping diagnostics |
| 5 | Stable tarball naming or registry install | Eliminates fragile filename parsing |
| 6 | Surface data dir in status | Eliminates implicit knowledge |
| 7 | SIGTERM flush for auto-capture | Eliminates data loss on restart |
| 8 | Config validation | Eliminates auth guesswork |

Items 1-4 would reduce my setup from ~50 lines of careful bash orchestration to roughly 2 commands.

## Response

| # | Status | Notes |
|---|--------|-------|
| 1 | Upstream | Requires OpenClaw gateway changes (`openclaw plugins install` CLI). Not actionable within this plugin. |
| 2 | Upstream | Requires OpenClaw gateway changes (install-time config). Not actionable within this plugin. |
| 3 | Done (existing) | Already implemented — `server-manager.ts` throws a clear error with install instructions when `uv` is missing on PATH. |
| 4 | Done | `gralkor status` now shows: server process state, LLM/embedder config, auto-capture/recall state, data directory, FalkorDB connectivity + graph stats (node/edge counts), Python venv state. |
| 5 | Available | npm registry install already works: `openclaw plugins install @susu-eng/gralkor`. Tarball naming follows npm conventions (`susu-eng-gralkor-memory-{version}.tgz`). |
| 6 | Done | Data directory path is now shown in `gralkor status` output. |
| 7 | Done | SIGTERM handler flushes all pending session buffers before exit. |
| 8 | Done | `gralkor check` validates: LLM provider + API key, embedder provider + API key, `uv` availability. |
