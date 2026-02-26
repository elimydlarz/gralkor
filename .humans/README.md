# Gralkor

**Persistent memory for OpenClaw agents, powered by knowledge graphs.**

Gralkor is an OpenClaw plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run locally via Docker.

When an agent converses with a user, Gralkor automatically extracts entities and relationships into a knowledge graph, and recalls relevant facts in future conversations — no manual prompt engineering required.

## Two Modes

Gralkor can run in two modes. Choose one — they should not be active at the same time.

### Memory mode

Replaces the native memory plugin entirely. Gralkor takes the memory slot.

- Graph tools: `graph_memory_recall`, `graph_memory_store`
- Native file tools (re-registered): `memory_search`, `memory_get`
- Hooks: auto-capture (stores conversations after each exchange), auto-recall (injects relevant facts before the agent responds)
- Set up: `plugins.slots.memory = "gralkor"` in `openclaw.json`

Use this if you want Graphiti to handle all memory. Native file-based memory tools are still available alongside the graph tools.

### Tool mode

Runs alongside the native `memory-core` plugin. The agent keeps its native `memory_search`/`memory_get` tools for Markdown files AND gets Graphiti-powered tools for structured knowledge retrieval.

- Tools: `graph_search`, `graph_add`
- Hooks: same auto-capture and auto-recall as memory mode
- Set up: add `"gralkor"` to `plugins.enabled` in `openclaw.json`

Use this if you want the best of both worlds — Markdown notes plus a knowledge graph.

Both modes register the same hooks, so conversations are automatically captured into the graph and relevant facts are automatically recalled regardless of which mode you choose.

## Quick Start

### 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (with Compose)
- An API key for a supported LLM provider (see below)

### 2. Install the plugin

#### Build the tarball (on your local machine)

```bash
make pack
# produces: openclaw-gralkor-memory-<version>.tgz  (memory mode)
#           openclaw-gralkor-tool-<version>.tgz    (tool mode)
```

#### Deploy to your agent's server

Copy the tarball to your agent's host (e.g. via scp, CI artifact, or include it in your deployment):

```bash
scp openclaw-gralkor-memory-*.tgz user@your-hetzner-host:~/
```

#### Tell your agent to install it

Ask your OpenClaw agent:

```
Install the Gralkor memory plugin from ~/openclaw-gralkor-memory-<version>.tgz
```

The agent will run `openclaw plugins install ~/openclaw-gralkor-memory-<version>.tgz`.

Then choose your mode in `openclaw.json`:

**Memory mode** (replaces native memory):
```json
{ "plugins": { "slots": { "memory": "gralkor" } } }
```

**Tool mode** (alongside native memory):
```json
{ "plugins": { "enabled": ["gralkor"] } }
```

### 3. Set up environment

Create a `.env` file in the plugin directory with your LLM provider key:

```bash
cp .env.example .env
# Edit .env and set the API key for your provider
```

Graphiti supports several LLM providers:

| Provider | Env var | Embeddings |
|---|---|---|
| **OpenAI** (default) | `OPENAI_API_KEY` | Built-in |
| **Google Gemini** | `GOOGLE_API_KEY` | Built-in |
| **Anthropic** | `ANTHROPIC_API_KEY` | Needs `OPENAI_API_KEY` too |
| **Groq** | `GROQ_API_KEY` | Needs `OPENAI_API_KEY` too |

If you switch providers, also update `config.yaml` to set the `llm.provider` and `llm.model`.

### 4. Start the backend

```bash
docker compose up -d
```

This starts:
- **FalkorDB** on port 6379 (Redis protocol) with a browser UI at [localhost:3000](http://localhost:3000)
- **Graphiti REST API** on port 8001

Verify it's running:

```bash
curl http://localhost:8001/health
```

### 5. Start chatting

Send messages to your agent as usual. Gralkor works in the background:
- **Auto-capture**: Conversations are stored in the knowledge graph after each exchange
- **Auto-recall**: Before the agent responds, relevant facts are retrieved and injected as context

## Tools

Agents (and users) can interact with the knowledge graph explicitly. Which tools are available depends on the mode.

Since conversations are **automatically captured** by hooks, agents don't need to store what was said. The explicit store tools (`graph_memory_store` / `graph_add`) are for higher-level content: insights, reflections, decisions, and connections the agent wants to preserve beyond the raw conversation.

### Memory mode tools

| Tool | Description |
|---|---|
| `graph_memory_recall` | Search the knowledge graph for deeper queries, older context, or specific entity lookups (recent context is auto-injected) |
| `graph_memory_store` | Store a thought, insight, reflection, or decision — not conversation content (that's auto-captured) |
| `memory_search` | Search native file-based memory (re-registered from `memory-core`) |
| `memory_get` | Get a specific memory file by path (re-registered from `memory-core`) |

### Tool mode tools

| Tool | Description |
|---|---|
| `graph_search` | Search the knowledge graph for deeper queries, older context, or specific entity lookups (recent context is auto-injected) |
| `graph_add` | Store a thought, insight, reflection, or decision — not conversation content (that's auto-captured) |

In tool mode, native `memory_search` and `memory_get` remain available from `memory-core`.

## CLI

```bash
openclaw gralkor status          # Check backend connectivity
openclaw gralkor search <query>  # Search the knowledge graph
openclaw gralkor clear [group]   # Delete all episodes for a group
```

## Configuration

Configure in your OpenClaw plugin settings:

| Setting | Default | Description |
|---|---|---|
| `graphitiUrl` | `http://graphiti:8001` | Graphiti API endpoint (Docker service name) |
| `autoCapture.enabled` | `true` | Automatically store conversations |
| `autoRecall.enabled` | `true` | Automatically recall relevant context |
| `autoRecall.maxResults` | `5` | How many facts to inject per turn |

### Graph partitioning

Each agent gets its own graph partition automatically (based on `agentId`, falling back to `"default"`). No configuration needed.

## How It Works

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
 └──────────────┘              └──────────┘               └──────────┘
```

Graphiti handles the heavy lifting: entity extraction, relationship mapping, temporal tracking, and embedding-based search. Gralkor just wires it into the OpenClaw plugin lifecycle.

## Exploring the Graph

Open [localhost:3000](http://localhost:3000) to browse FalkorDB's web UI. You'll see nodes (entities) and edges (relationships) that Graphiti has extracted from your conversations.

## Troubleshooting

**Graphiti container keeps restarting**
Check logs with `docker compose logs graphiti`. Most likely cause: missing or invalid LLM provider API key in `.env`.

**`gralkor status` says unreachable**
Make sure Docker is running and the containers are up: `docker compose ps`.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true`
- Verify the graph has data: visit [localhost:3000](http://localhost:3000) or run `openclaw gralkor search <term>`
- Auto-recall extracts keywords from the user's message — very short messages may not match anything

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true`
- Messages under 10 characters and messages starting with `/` are skipped by design
