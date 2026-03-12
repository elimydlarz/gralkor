# Gralkor

**Persistent memory for OpenClaw agents, powered by knowledge graphs.**

Gralkor is an OpenClaw plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run automatically as a managed subprocess — no Docker required.

When an agent converses with a user, Gralkor automatically extracts entities and relationships into a knowledge graph, and recalls relevant facts in future conversations — no manual prompt engineering required.

## What it does

Gralkor replaces the native memory plugin entirely, taking the memory slot.

- **`memory_search`** — searches both native Markdown files and the knowledge graph in parallel, returning combined results
- **`memory_get`** — reads native Markdown memory files directly (delegated to OpenClaw's built-in implementation)
- **`memory_add`** — stores information in the knowledge graph; Graphiti extracts entities and relationships
- Hooks: auto-capture (stores full multi-turn conversations after each agent run), auto-recall (injects relevant facts and entities before the agent responds)
- Set up: `plugins.slots.memory = "gralkor"` in `openclaw.json`

The agent gets a unified memory interface where it doesn't need to think about which backend to query.

## Quick Start

### 1. Prerequisites

- OpenClaw >= 2026.1.26
- Python 3.12+ on the system PATH
- An API key for a supported LLM provider (see below)

### 2. Install the plugin

**From npm (recommended):**

```bash
openclaw plugins install @susu-eng/gralkor
```

**From tarball:**

Clone and build:

```bash
git clone https://github.com/susu-eng/gralkor.git && cd gralkor
pnpm install && make pack
```

Then install:

```bash
openclaw plugins install ./openclaw-gralkor-memory-<version>.tgz
```

The plugin files land in `~/.openclaw/plugins/gralkor/`.

### 3. Configure and enable the plugin

Edit `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "gralkor"
    },
    "entries": {
      "gralkor": {
        "enabled": true,
        "config": {}
      }
    }
  }
}
```

### 4. Set your LLM API key

Graphiti needs an LLM to extract entities and relationships from conversations. Make sure the API key for your chosen provider is available in the environment (see [OpenClaw docs](https://openclaw.dev/docs) for where env vars are configured).

Supported providers:

| Provider | Env var | Notes |
|---|---|---|
| **Google Gemini** (default) | `GOOGLE_API_KEY` | Fully self-contained (LLM + embeddings + reranking) |
| **OpenAI** | `OPENAI_API_KEY` | Handles LLM + embeddings out of the box |
| **Anthropic** | `ANTHROPIC_API_KEY` | LLM only — still needs `OPENAI_API_KEY` for embeddings |
| **Groq** | `GROQ_API_KEY` | LLM only — still needs `OPENAI_API_KEY` for embeddings |

To switch away from Gemini, set `llm` and `embedder` in the plugin config. For example, with OpenAI:

```json
{
  "plugins": {
    "slots": {
      "memory": "gralkor"
    },
    "entries": {
      "gralkor": {
        "enabled": true,
        "config": {
          "llm": { "provider": "openai", "model": "gpt-4.1-mini" },
          "embedder": { "provider": "openai", "model": "text-embedding-3-small" }
        }
      }
    }
  }
}
```

### 5. Restart and go

Restart OpenClaw. On first start, Gralkor automatically:
- Creates a Python virtual environment
- Installs Graphiti and its dependencies (~1-2 min first time)
- Starts the Graphiti server with embedded FalkorDB
- Subsequent restarts are fast (venv reused, pip skipped)

Verify the plugin loaded:

```bash
openclaw plugins list
openclaw gralkor status
```

Start chatting with your agent. Gralkor works in the background:
- **Auto-capture**: Full multi-turn conversations are stored in the knowledge graph after each agent run
- **Auto-recall**: Before the agent responds, relevant facts and entities are retrieved and injected as context

## Native memory search

In memory mode, `memory_search` searches both the knowledge graph and native Markdown files (`MEMORY.md`, `memory/*.md`). For native memory indexing to work, OpenClaw's gateway needs an embedding provider API key in its environment.

Add a key to `~/.openclaw/.env` if you haven't already:

```bash
echo 'OPENAI_API_KEY=sk-proj-...' >> ~/.openclaw/.env
```

Any of `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `VOYAGE_API_KEY`, or `MISTRAL_API_KEY` will work. Without this, native `memory_search` results will be empty (this is an upstream OpenClaw bug in FTS-only mode — the FTS table is never populated without an embedding provider).

## CLI

```bash
openclaw gralkor status          # Check backend connectivity and server process status
openclaw gralkor search <query>  # Search the knowledge graph
openclaw gralkor clear [group]   # Delete all data for a group (destructive!)
```

The native `openclaw memory` commands also remain available.

## Configuration

Configure in your OpenClaw plugin settings (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "entries": {
      "gralkor": {
        "enabled": true,
        "config": {
          "autoCapture": { "enabled": true },
          "autoRecall": { "enabled": true, "maxResults": 5 },
          "idleTimeoutMs": 300000,
          "dataDir": "/path/to/data"
        }
      }
    }
  }
}
```

| Setting | Default | Description |
|---|---|---|
| `autoCapture.enabled` | `true` | Automatically store conversations in the graph |
| `autoRecall.enabled` | `true` | Automatically recall relevant context before each turn |
| `autoRecall.maxResults` | `5` | Maximum number of facts injected as context |
| `idleTimeoutMs` | `300000` | How long (ms) after the last agent response to wait before flushing buffered messages to the graph. Prevents data loss when sessions aren't explicitly ended (e.g. user walks away, gateway restarts). Set to `0` to disable idle flushing. |
| `dataDir` | `{pluginDir}/../.gralkor-data` | Directory for backend data (Python venv, FalkorDB database) |
| `test` | `false` | Test mode — logs full episode bodies and search results at plugin boundaries for debugging |

### Graph partitioning

Each agent gets its own graph partition automatically (based on `agentId`). No configuration needed — different agents won't see each other's knowledge.

## Data storage

By default, all data lives in `.gralkor-data/` alongside the plugin directory (i.e. `{pluginDir}/../.gralkor-data/`):
- `venv/` — Python virtual environment (Graphiti, FalkorDBLite, etc.)
- `falkordb/` — embedded FalkorDB database files

This location is outside the plugin directory so that `openclaw plugins uninstall` doesn't destroy runtime data — the graph database survives plugin upgrades without any data-preservation workarounds.

Set `dataDir` in plugin config to change the location.

## How it works

```
User sends message
       │
       ▼
 ┌─────────────┐     search     ┌──────────┐     query     ┌──────────┐
 │  auto-recall │ ──────────▶   │ Graphiti  │ ──────────▶   │ FalkorDB │
 │    hook      │ ◀──────────   │   API     │ ◀──────────   │          │
 └─────────────┘    facts       └──────────┘   subgraph     └──────────┘
       │
       ▼
 Agent runs (with recalled facts as context)
       │
       ▼
 ┌──────────────┐    ingest     ┌──────────┐    extract     ┌──────────┐
 │ auto-capture  │ ──────────▶  │ Graphiti  │ ──────────▶   │ FalkorDB │
 │    hook       │              │   API     │   entities    │          │
 └──────────────┘              └──────────┘   & facts      └──────────┘
```

Graphiti handles the heavy lifting: entity extraction, relationship mapping, temporal tracking, and embedding-based search. Gralkor wires it into the OpenClaw plugin lifecycle. The Graphiti server and embedded FalkorDB run as a managed subprocess — started and stopped automatically by the plugin.

## Troubleshooting

**`gralkor status` says "Server process: stopped"**
Python 3.12+ is not found on the system PATH. Install Python 3.12+ and restart OpenClaw.

**First startup takes a long time**
Normal — Gralkor is creating a Python virtual environment and installing dependencies via pip. This takes ~1-2 minutes. Subsequent starts reuse the venv and skip pip.

**Plugin loads but all graph operations fail**
Check logs with `openclaw gralkor status`. Most likely: missing or invalid LLM API key in `~/.openclaw/.env`.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true` (it is by default)
- Verify the graph has data: run `openclaw gralkor search <term>`
- Auto-recall extracts keywords from the user's message — very short messages may not match

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true` (it is by default)
- Conversations are flushed to the graph when the session ends or after 5 minutes of inactivity (configurable via `idleTimeoutMs`). If the process is killed before either fires, buffered messages are lost.
- Conversations where the first user message starts with `/` are skipped by design
- Empty conversations (no extractable text) are skipped

**`memory_search` returns empty in memory mode**
Native memory indexing needs an embedding provider key in the OpenClaw gateway's environment. See the "Native memory search" section above.

## Legacy Docker mode

If you prefer to run FalkorDB as a separate Docker container (e.g. for production deployments with specific resource constraints), you can set `FALKORDB_URI` to bypass the embedded mode:

```bash
cd ~/.openclaw/plugins/gralkor
docker build -t gralkor-server:latest server/
FALKORDB_URI=redis://falkordb:6379 docker compose up -d
```

This starts FalkorDB on port 6379 and the Graphiti API on port 8001. If your OpenClaw gateway runs in Docker, connect it to the `gralkor` network:

```bash
docker network connect gralkor <your-openclaw-container-name>
```
