# Gralkor

**Persistent memory for OpenClaw agents, powered by knowledge graphs.**

Gralkor is an OpenClaw plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run locally via Docker.

When an agent converses with a user, Gralkor automatically extracts entities and relationships into a knowledge graph, and recalls relevant facts in future conversations — no manual prompt engineering required.

## Two Modes

Gralkor can run in two modes. Choose one — they should not be active at the same time.

### Memory mode (recommended)

Replaces the native memory plugin entirely. Gralkor takes the memory slot.

- **`memory_search`** — searches both native Markdown files and the knowledge graph in parallel, returning combined results
- **`memory_get`** — reads native Markdown memory files directly (delegated to OpenClaw's built-in implementation)
- **`memory_add`** — stores information in the knowledge graph; Graphiti extracts entities and relationships
- Hooks: auto-capture (stores full multi-turn conversations after each agent run), auto-recall (injects relevant facts and entities before the agent responds)
- Set up: `plugins.slots.memory = "gralkor"` in `openclaw.json`

Use this if you want a unified memory interface where the agent doesn't need to think about which backend to query.

### Tool mode

Runs alongside the native `memory-core` plugin. The agent keeps its native `memory_search`/`memory_get` tools for Markdown files AND gets Graphiti-powered tools.

- **`graph_search`** — searches the knowledge graph for facts and entities
- **`graph_add`** — stores information in the knowledge graph
- Hooks: same auto-capture and auto-recall as memory mode
- Set up: add `"gralkor"` to `plugins.enabled` in `openclaw.json`

Use this if you want to keep native file-based memory separate from the knowledge graph.

Both modes register the same hooks, so conversations are automatically captured and relevant facts are automatically recalled regardless of which mode you choose.

## Quick Start

### 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (with Compose)
- An API key for a supported LLM provider (see below)

### 2. Build the plugin tarball

```bash
pnpm install
make pack
# produces: openclaw-gralkor-memory-<version>.tgz  (memory mode)
#           openclaw-gralkor-tool-<version>.tgz    (tool mode)
```

### 3. Deploy the tarball

Copy the tarball to your agent's host:

```bash
scp openclaw-gralkor-memory-*.tgz user@your-host:~/
```

### 4. Install the plugin

On the agent's host:

```bash
openclaw plugins install ~/openclaw-gralkor-memory-<version>.tgz
```

The plugin files land in `~/.openclaw/plugins/gralkor/`.

### 5. Configure the LLM provider

```bash
cd ~/.openclaw/plugins/gralkor
cp .env.example .env
# Edit .env and set the API key for your provider
```

Graphiti needs an LLM to extract entities and relationships from conversations. Supported providers:

| Provider | Env var | Notes |
|---|---|---|
| **OpenAI** (default) | `OPENAI_API_KEY` | Handles LLM + embeddings out of the box |
| **Google Gemini** | `GOOGLE_API_KEY` | Fully self-contained (LLM + embeddings + reranking) |
| **Anthropic** | `ANTHROPIC_API_KEY` | LLM only — still needs `OPENAI_API_KEY` for embeddings |
| **Groq** | `GROQ_API_KEY` | LLM only — still needs `OPENAI_API_KEY` for embeddings |

If you switch away from OpenAI, also update `config.yaml` to set `llm.provider`, `llm.model`, `embedder.provider`, and `embedder.model`. For example, with Gemini:

```yaml
llm:
  provider: "gemini"
  model: "gemini-2.5-flash"

embedder:
  provider: "gemini"
  model: "text-embedding-004"
```

### 6. Start the backend

```bash
cd ~/.openclaw/plugins/gralkor

# Build the Graphiti server image from included source
docker build -t gralkor-server:latest server/

# Start FalkorDB + Graphiti
docker compose up -d
```

This starts:
- **FalkorDB** on port 6379 (Redis protocol) with a browser UI at [localhost:3000](http://localhost:3000)
- **Graphiti REST API** on port 8001

Verify it's running:

```bash
curl http://localhost:8001/health
```

### 7. Enable the plugin

Edit `~/.openclaw/openclaw.json`:

**Memory mode** (replaces native memory):
```json
{
  "plugins": {
    "slots": {
      "memory": "gralkor"
    }
  }
}
```

**Tool mode** (alongside native memory):
```json
{
  "plugins": {
    "enabled": ["gralkor"]
  }
}
```

### 8. Restart and go

Restart OpenClaw. Verify the plugin loaded:

```bash
openclaw plugins list
```

Start chatting with your agent. Gralkor works in the background:
- **Auto-capture**: Full multi-turn conversations are stored in the knowledge graph after each agent run
- **Auto-recall**: Before the agent responds, relevant facts and entities are retrieved and injected as context

## Network setup for Docker-based OpenClaw

If your OpenClaw gateway runs inside a Docker container, it needs to reach the Graphiti server at `http://graphiti:8001`. Connect it to the `gralkor` network:

```bash
docker network connect gralkor <your-openclaw-container-name>
```

## Native memory search (memory mode only)

In memory mode, `memory_search` searches both the knowledge graph and native Markdown files (`MEMORY.md`, `memory/*.md`). For native memory indexing to work, OpenClaw's gateway needs an embedding provider API key in its own environment — not just in Gralkor's `.env`.

Add a key to `~/.openclaw/.env` if you haven't already:

```bash
echo 'OPENAI_API_KEY=sk-proj-...' >> ~/.openclaw/.env
```

Any of `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `VOYAGE_API_KEY`, or `MISTRAL_API_KEY` will work. Without this, native `memory_search` results will be empty (this is an upstream OpenClaw bug in FTS-only mode — the FTS table is never populated without an embedding provider).

## CLI

```bash
openclaw gralkor status          # Check backend connectivity and graph stats
openclaw gralkor search <query>  # Search the knowledge graph
openclaw gralkor clear [group]   # Delete all data for a group (destructive!)
```

In memory mode, the native `openclaw memory` commands also remain available.

## Configuration

Configure in your OpenClaw plugin settings (`~/.openclaw/openclaw.json`):

```json
{
  "plugins": {
    "config": {
      "gralkor": {
        "autoCapture": { "enabled": true },
        "autoRecall": { "enabled": true, "maxResults": 5 }
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

### Graph partitioning

Each agent gets its own graph partition automatically (based on `agentId`). No configuration needed — different agents won't see each other's knowledge.

## Data storage

FalkorDB stores its data in a Docker volume called `falkordb_data` by default. To colocate it with OpenClaw's data directory (useful for backups):

```bash
export FALKORDB_DATA_DIR=/path/to/openclaw/data/falkordb
docker compose up -d
```

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

Graphiti handles the heavy lifting: entity extraction, relationship mapping, temporal tracking, and embedding-based search. Gralkor wires it into the OpenClaw plugin lifecycle.

## Exploring the graph

Open [localhost:3000](http://localhost:3000) to browse FalkorDB's web UI. You'll see nodes (entities like people, projects, concepts) and edges (relationships/facts) that Graphiti has extracted from conversations.

## Ports

| Service | Port | Purpose |
|---|---|---|
| FalkorDB | 6379 | Graph database (Redis protocol) |
| FalkorDB Browser | 3000 | Web UI for browsing the graph |
| Graphiti | 8001 | REST API (plugin communicates here) |

## Troubleshooting

**Graphiti container keeps restarting**
Check logs with `docker compose logs graphiti`. Most likely: missing or invalid LLM API key in `.env`. FalkorDB may also need a few seconds to initialize — try `docker compose restart graphiti`.

**`gralkor status` says unreachable**
Make sure Docker is running and the containers are up: `docker compose ps`. Verify Graphiti responds: `curl http://localhost:8001/health`.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true` (it is by default)
- Verify the graph has data: visit [localhost:3000](http://localhost:3000) or run `openclaw gralkor search <term>`
- Auto-recall extracts keywords from the user's message — very short messages may not match

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true` (it is by default)
- Conversations where the first user message starts with `/` are skipped by design
- Empty conversations (no extractable text) are skipped

**`memory_search` returns empty in memory mode**
Native memory indexing needs an embedding provider key in the OpenClaw gateway's environment. See the "Native memory search" section above.
