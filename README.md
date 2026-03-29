# Gralkor

**Persistent memory for OpenClaw agents, powered by knowledge graphs.**

Gralkor is an OpenClaw plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run automatically as a managed subprocess — no Docker required.

Gralkor automatically remembers and recalls everything your agents says, _thinks_, and _does_ — no prompt engineering required by the operator, no conscious (haha) effort required by the agent.

## Why Gralkor

After years of building with every AI memory system out there, reading the latest research daily, and doing my own cognitive architecture experiments, I am here to tell you a thing or two about AI memory, and why you should use Gralkor for your OpenClaw agents and forget everything else.

**Graphs, not Markdown or pure vector** The AI ecosystem's fixation on Markdown-based memory is baffling. Graphs have been the right data structure for representing knowledge since long before LLMs existed. Your code is a graph (syntax trees). Your filesystem is a graph. The web is a graph. Relationships between entities are naturally graph-shaped, and trying to flatten them into Markdown files or pure vector embeddings is fighting reality. [Graphiti](https://github.com/getzep/graphiti) combines a knowledge graph with vector search — you get structured relationships *and* semantic retrieval. Facts carry temporal validity: when they became true, when they stopped being true, when they were superseded. This is not yet another chunking strategy or embedding experiment. Graphiti has solved this layer of the problem and we build on top of it (and not much).

**Remembering behaviour, not just dialog.** When your agent reasons through a problem — weighing options, rejecting approaches, arriving at a conclusion — that thinking process is as valuable as the final answer. Gralkor distills the agent's thinking blocks into first-person behavioural summaries and weaves them into the episode transcript before ingestion. The graph doesn't just know what was said; it knows how the agent arrived there. This adds roughly 20% to token cost during ingestion. *Fighting words*: Other memory systems only remember what was spoken, totally ignoring what your agent thinkgs and does. Even if you have a sophisticated memory system, your agent is inherently dishonest with you, frequently claiming to remember what it has done when it only really remembers what claimed to have done, or to have thought what it is only now imagining. Gralkor actually remembers what your agent thought and did - it is the only memory system with this capability AFAIK.

**Maximum context at ingestion.** Most memory systems save isolated question-answer pairs or summarized snippets. Gralkor captures all messages in each session of work, distills behaviour, and feeds results to Graphiti *as whole episodes*. Extraction works _way_ better when Graphiti has full context rather fragmented QA pairs. *Fighting words*: Other memory systems capture single QA exchanges of dialog, we capture _the whole episode_ - the entire series of questions, thoughts, actions, and responses that _solved the problem_. Richer semantics, better understanding, better recall.

**Built for the long term.**. Graphiti - on which Gralkor is based - is _temporally aware_. On every ingestion, it doesn't just append, it resolves new information against the existing graph, amending, expiring, and invalidating so that your agent knows _what happened over time_. This is expensive, bad for throughput, and useless for short-lived agents, so serving a single, long-lived user agent is _the perfect use case_. Graphiti was destined for Gralkor and OpenClaw.

**Recursion through reflection.** A knowledge graph is a living structure. The most powerful thing you can do with it is point the agent back at its own memory — let it reflect on what it knows, identify contradictions, synthesize higher-order insights, and do with them whatever you believe to be _good cognitive architecture_ :shrug:. Gralkor doesn't prescribe how you do this. Instead, it provides the platform for cognitive architecture experimentation: a structured, temporally-aware graph that the agent can both read from and write to using OpenClaw crons.

```bash
# Example: schedule the agent to reflect on its memory every 6 hours
openclaw cron add --every 6h --prompt "Search your memory for recent facts. \
Look for contradictions, outdated information, or patterns worth consolidating. \
Use memory_add to store any new insights."
```

This is where it gets interesting. The graph gives you a substrate for experimentation — reflection strategies, knowledge consolidation, cross-session reasoning — that flat retrieval systems simply cannot support.

**Custom ontology: model your agent's world _your way_.** Define your own entity types, attributes, and relationships so that information is parsed into the language of your domain — or your life. [Apple's ODKE+](https://arxiv.org/abs/2509.04696) (2025) showed ontology-guided extraction hits 98.8% precision vs 91% raw LLM; a [separate study](https://arxiv.org/abs/2511.05991) (2025) found ontology-guided KGs substantially outperform vector baselines for retrieval. *Fighting words*: When every entity is just a "thing" and every relationship is `RELATES_TO`, your graph is a soup of ambiguity. Custom ontology turns it into a structured model of _your_ world.

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
- `uv` on PATH ([install](https://docs.astral.sh/uv/getting-started/installation/))
- An API key for a supported LLM provider (see below)

### 2. Install the plugin

**Using the CLI helper (recommended):**

```bash
npx @susu-eng/gralkor-cli install @susu-eng/gralkor
```

This handles everything: installs the plugin, enables it, assigns the memory slot, and migrates from `memory-gralkor` if present. You can also pass config inline:

```bash
npx @susu-eng/gralkor-cli install @susu-eng/gralkor \
  --config '{"llm":{"provider":"openai","model":"gpt-4.1-mini"}}'
```

Or from a tarball:

```bash
npx @susu-eng/gralkor-cli install /path/to/susu-eng-gralkor-memory-19.0.4.tgz
```

The install is idempotent — running it again with the same version is a no-op.

**Manual install:**

```bash
openclaw plugins install @susu-eng/gralkor
```

Then edit `~/.openclaw/openclaw.json`:

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

### 3. Set your LLM API key

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

### 4. Restart and go

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

In memory mode, `memory_search` searches both the knowledge graph and native Markdown files (`MEMORY.md`, `memory/*.md`). For native memory indexing to work, OpenClaw's gateway needs an embedding provider API key (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `VOYAGE_API_KEY`, or `MISTRAL_API_KEY`) in its environment. Without this, native `memory_search` results will be empty (this is an upstream OpenClaw bug in FTS-only mode — the FTS table is never populated without an embedding provider).

## CLI

### Lifecycle management (`@susu-eng/gralkor-cli`)

Install the CLI globally or use via `npx`:

```bash
gralkor install <source>         # Idempotent install/upgrade with slot assignment
gralkor config --set llm.model=gpt-4.1-mini  # Set plugin config
gralkor check                    # Pre-flight: uv, API keys, plugin state, server health
gralkor status                   # Plugin version, slot, server health, graph stats
```

The `install` command handles version comparison, upgrades, migration from the old `memory-gralkor` plugin ID, and optional `--config`/`--set` flags. Use `--dry-run` to preview what it would do.

### Plugin commands (via OpenClaw)

```bash
openclaw gralkor status          # Server state, config, graph stats, data dir, venv
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
          "autoRecall": { "enabled": true, "maxResults": 10 },
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
| `autoRecall.maxResults` | `10` | Maximum number of facts injected as context |
| `idleTimeoutMs` | `300000` | How long (ms) after the last agent response to wait before flushing buffered messages to the graph. Prevents data loss when sessions aren't explicitly ended (e.g. user walks away, gateway restarts). Set to `0` to disable idle flushing. |
| `dataDir` | `{pluginDir}/../.gralkor-data` | Directory for backend data (Python venv, FalkorDB database) |
| `test` | `false` | Test mode — logs full episode bodies and search results at plugin boundaries for debugging |

### Graph partitioning

Each agent gets its own graph partition automatically (based on `agentId`). No configuration needed — different agents won't see each other's knowledge.

## Custom entity and relationship types

By default, Graphiti extracts generic entities and connects them with generic `RELATES_TO` relationships. This works well out of the box — you don't need to configure anything for Gralkor to be useful.

If you want more structured extraction, you can define custom entity and relationship types. Graphiti will classify entities into your types, extract structured attributes, and create typed relationships between them.

### Entities only (start here)

The simplest useful ontology defines just entity types. Relationships will still be created, using Graphiti's default `RELATES_TO` type.

```json
{
  "plugins": {
    "entries": {
      "gralkor": {
        "enabled": true,
        "config": {
          "ontology": {
            "entities": {
              "Project": {
                "description": "A software project or initiative being actively developed. Look for mentions of repositories, codebases, applications, services, or named systems that are built and maintained by a team.",
                "attributes": {
                  "status": ["active", "completed", "paused"],
                  "language": "Primary programming language used in the project"
                }
              },
              "Technology": {
                "description": "A programming language, framework, library, database, or infrastructure tool. Identify by mentions of specific named technologies used in or considered for projects.",
                "attributes": {
                  "category": ["language", "framework", "database", "infrastructure", "tool"]
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Adding relationships

To control how entities are connected, add `edges` (relationship types) and `edgeMap` (which entity pairs they apply to):

```json
{
  "ontology": {
    "entities": {
      "Project": {
        "description": "A software project or initiative being actively developed. Look for mentions of repositories, codebases, applications, services, or named systems that are built and maintained by a team.",
        "attributes": {
          "status": ["active", "completed", "paused"],
          "language": "Primary programming language used in the project"
        }
      },
      "Technology": {
        "description": "A programming language, framework, library, database, or infrastructure tool. Identify by mentions of specific named technologies used in or considered for projects.",
        "attributes": {
          "category": ["language", "framework", "database", "infrastructure", "tool"]
        }
      }
    },
    "edges": {
      "Uses": {
        "description": "A project actively using a technology in its stack. Look for statements about tech choices, dependencies, or implementation details that indicate a project relies on a specific technology.",
        "attributes": {
          "version": "Version of the technology in use, if mentioned"
        }
      }
    },
    "edgeMap": {
      "Project,Technology": ["Uses"]
    }
  }
}
```

Without `edgeMap`, all edge types can connect any entity pair. With `edgeMap`, relationships are constrained to specific pairs — entity pairs not listed fall back to `RELATES_TO`.

### Attribute format

Attributes control what Graphiti extracts for each entity or relationship. They are **required fields** — if the LLM can't populate them from the text, it won't extract that entity type at all. This makes attributes the primary mechanism for gating extraction quality.

| Format | Example | Generated type | Gating strength |
|---|---|---|---|
| String | `"language": "Primary programming language"` | Required `str` field | Weak — any text satisfies it |
| Enum (array) | `"status": ["active", "completed", "paused"]` | Required `Literal` enum | Strong — must pick a valid value |
| Typed object | `"budget": { "type": "float", "description": "Budget in USD" }` | Required typed field | Medium — must be valid type |
| Enum with description | `"priority": { "enum": ["low", "high"], "description": "Priority level" }` | Required `Literal` enum | Strong |

Supported types for the object form: `string`, `int`, `float`, `bool`, `datetime`.

### Writing good descriptions

Descriptions are the most important part of your ontology — they tell the LLM what to look for. Write them like extraction instructions, not dictionary definitions.

**Weak** (dictionary definition):
```
"A software project."
```

**Strong** (extraction instructions):
```
"A software project or initiative being actively developed. Look for mentions of repositories, codebases, applications, services, or named systems that are built and maintained by a team."
```

The more specific your description, the better Graphiti will distinguish between entity types and avoid false positives.

### Excluding entity types

To prevent Graphiti from extracting certain default entity types:

```json
{
  "ontology": {
    "excludedEntityTypes": ["SomeType"]
  }
}
```

### Reserved names

The following entity names are used internally by Graphiti and cannot be used: `Entity`, `Episodic`, `Community`, `Saga`.

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
Run `openclaw gralkor check` to validate your provider configuration and API keys. Most likely: missing or invalid LLM API key in the environment.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true` (it is by default)
- Verify the graph has data: run `openclaw gralkor search <term>`
- Auto-recall extracts keywords from the user's message — very short messages may not match

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true` (it is by default)
- Conversations are flushed to the graph when the session ends or after 5 minutes of inactivity (configurable via `idleTimeoutMs`). On SIGTERM, all pending buffers are flushed before shutdown. If the process receives SIGKILL without prior SIGTERM, buffered messages may be lost.
- Conversations where the first user message starts with `/` are skipped by design
- Empty conversations (no extractable text) are skipped

**Agent doesn't have the `memory_add` tool**
OpenClaw's tool profiles (`coding`, `minimal`, etc.) only allowlist core tools by default. `memory_add` is a plugin tool, so it gets filtered out when a profile is active. To enable it, add it to `alsoAllow` in your `openclaw.json`:

```json
{
  "tools": {
    "alsoAllow": ["memory_add"]
  }
}
```

You can also allow all Gralkor tools with `"alsoAllow": ["gralkor"]` or all plugin tools with `"alsoAllow": ["group:plugins"]`. Note that `memory_add` is not required for Gralkor to work — auto-capture already stores everything your agent hears, says, thinks, and does. `memory_add` is only needed if you want the agent to selectively store specific insights or conclusions on its own.

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
