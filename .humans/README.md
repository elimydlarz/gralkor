# Gralkor

**Persistent memory for OpenClaw agents, powered by knowledge graphs.**

Gralkor is an OpenClaw memory plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run locally via Docker.

When an agent converses with a user, Gralkor automatically extracts entities and relationships into a knowledge graph, and recalls relevant facts in future conversations — no manual prompt engineering required.

## Quick Start

### 1. Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (with Compose)
- [Node.js](https://nodejs.org/) >= 20
- An [OpenAI API key](https://platform.openai.com/api-keys) (used by Graphiti for embeddings)

### 2. Set up environment

```bash
cp .env.example .env
# Edit .env and add your OpenAI API key
```

### 3. Start the backend

```bash
docker compose up -d
```

This starts:
- **FalkorDB** on port 6379 (Redis protocol) with a browser UI at [localhost:3000](http://localhost:3000)
- **Graphiti REST API** on port 8000

Verify it's running:

```bash
curl http://localhost:8000/health
```

### 4. Install the plugin

```bash
openclaw plugins install -l .
```

Then set the memory slot in your `openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "memory-gralkor"
    }
  }
}
```

### 5. Start chatting

Send messages to your agent as usual. Gralkor works in the background:
- **Auto-capture**: Conversations are stored in the knowledge graph after each exchange
- **Auto-recall**: Before the agent responds, relevant facts are retrieved and injected as context

## Tools

Agents (and users) can also interact with memory explicitly:

| Tool | Description |
|---|---|
| `memory_recall` | Search the knowledge graph for facts and entities |
| `memory_store` | Manually store information in the graph |
| `memory_forget` | Remove information by UUID, or search for items to delete |

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
| `graphitiUrl` | `http://localhost:8000` | Graphiti API endpoint |
| `groupIdStrategy` | `per-user` | Graph partitioning — see below |
| `autoCapture.enabled` | `true` | Automatically store conversations |
| `autoRecall.enabled` | `true` | Automatically recall relevant context |
| `autoRecall.maxResults` | `5` | How many facts to inject per turn |

### Graph partitioning

The `groupIdStrategy` controls how memory is isolated:

- **`per-user`** (default) — Each user has their own memory. Agent remembers things about Alice separately from Bob.
- **`per-conversation`** — Memory is scoped to a session. Starting a new conversation starts with a blank slate.
- **`global`** — All users share one memory pool. Useful for team knowledge bases.

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
Check logs with `docker compose logs graphiti`. Most likely cause: missing or invalid `OPENAI_API_KEY`.

**`gralkor status` says unreachable**
Make sure Docker is running and the containers are up: `docker compose ps`.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true`
- Verify the graph has data: visit [localhost:3000](http://localhost:3000) or run `openclaw gralkor search <term>`
- Auto-recall extracts keywords from the user's message — very short messages may not match anything

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true`
- Messages under 10 characters and messages starting with `/` are skipped by design
