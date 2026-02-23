# Gralkor — OpenClaw Memory Plugin (Graphiti + FalkorDB)

## What is this?

An OpenClaw memory plugin that gives AI agents persistent, temporally-aware memory.
Uses Graphiti (knowledge graph framework by Zep) backed by FalkorDB (in-memory graph database).
Drop-in replacement for `memory-lancedb` in the OpenClaw memory slot.

## Architecture

```
OpenClaw Gateway (Node.js)
  └── memory-gralkor plugin (TypeScript)
        ├── Tools: memory_recall, memory_store, memory_forget
        ├── Hooks: before_agent_start (auto-recall), agent_end (auto-capture)
        ├── Service: health monitor (60s interval)
        └── CLI: gralkor status, gralkor search, gralkor clear
              │
              ▼  HTTP (fetch)
        Graphiti REST API (FastAPI, port 8000)
              │
              ▼  Redis protocol
        FalkorDB (port 6379, browser UI port 3000)
```

## File Structure

- `src/index.ts` — Plugin entry point. Default export with `register(api, config)`. Wires up tools, hooks, service, and CLI. Falls back to CLI-only mode if no `graphitiUrl` is explicitly configured.
- `src/client.ts` — `GraphitiClient` class. HTTP wrapper around the Graphiti REST API with retry logic (retries network errors and 5xx, not 4xx) and configurable timeout.
- `src/tools.ts` — Tool factories: `memory_recall`, `memory_store`, `memory_forget`. Each takes `(client, config)` and returns a tool object.
- `src/hooks.ts` — Hook factories: `before_agent_start` (auto-recall), `agent_end` (auto-capture). Both degrade silently if Graphiti is unreachable.
- `src/config.ts` — `GralkorConfig` interface, defaults, `resolveConfig()`, and `resolveGroupId()`.
- `openclaw.plugin.json` — Plugin manifest with config schema and UI hints.
- `docker-compose.yml` — FalkorDB + Graphiti backend services.

## Configuration

| Field | Type | Default | Description |
|---|---|---|---|
| `graphitiUrl` | string | `http://localhost:8000` | Graphiti REST API URL |
| `groupIdStrategy` | enum | `per-user` | How to partition the knowledge graph |
| `autoCapture.enabled` | boolean | `true` | Store conversations automatically |
| `autoRecall.enabled` | boolean | `true` | Inject relevant context before agent runs |
| `autoRecall.maxResults` | number | `5` | Max facts injected as context |

### Group ID Strategy

Controls how the knowledge graph is partitioned:
- `per-user` — each user gets their own graph, keyed by `ctx.senderId` (default)
- `per-conversation` — per session, keyed by `ctx.sessionKey` or `channel-senderId`
- `global` — single shared graph under the key `"gralkor"`

### Graceful Degradation

- If `graphitiUrl` is **not explicitly configured** (no config value, no `GRAPHITI_URL` env var), only the CLI is registered — no tools or hooks. This lets users run `gralkor status` to diagnose setup.
- If Graphiti is configured but **unreachable at runtime**, hooks silently skip (no errors surfaced to the agent), and tools throw so the agent sees the failure.

## Environment Variables

- `OPENAI_API_KEY` — **Required by Graphiti** for embeddings and entity extraction. Set in `.env` (see `.env.example`).
- `GRAPHITI_URL` — Optional. Checked by the plugin as a fallback if `graphitiUrl` isn't in the plugin config.

## Dev Workflow

```bash
# Start backend services
docker compose up -d

# Verify Graphiti is running
curl http://localhost:8000/health

# Install plugin locally in OpenClaw
openclaw plugins install -l .

# Set memory slot in openclaw.json:
#   plugins.slots.memory = "memory-gralkor"

# Type-check
npx tsc --noEmit

# Run tests
npx vitest
```

## Key Commands

- `docker compose up -d` — start FalkorDB + Graphiti
- `docker compose down` — stop services
- `docker compose logs graphiti` — check Graphiti logs
- `npx tsc --noEmit` — type-check
- `npx vitest` — run tests

## Conventions

- TypeScript, ES modules (`"type": "module"`)
- Target: ES2022, module resolution: bundler
- All Graphiti communication is HTTP via `src/client.ts` — no direct FalkorDB access
- Tool names follow the `memory_*` pattern (matches `memory-lancedb` for slot compatibility)
- Config types are plain TypeScript interfaces in `src/config.ts`
- Imports use `.js` extensions (required for ESM with TypeScript)

## Gotchas

- Graphiti requires `OPENAI_API_KEY` — without it the container starts but all operations fail
- FalkorDB must be healthy before Graphiti can start (`depends_on` in docker-compose handles this, but no healthcheck — Graphiti may need a few seconds after FalkorDB is up)
- The client retries network errors and 5xx responses (up to 2 retries with backoff) but throws immediately on 4xx client errors
- Auto-recall injects context as XML-tagged content marked `trust="untrusted"`
- Auto-capture skips messages shorter than 10 chars and messages starting with `/`
