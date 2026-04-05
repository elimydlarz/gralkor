# Gralkor

**Persistent memory for OpenClaw agents, powered by knowledge graphs.**

Gralkor is an OpenClaw plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run automatically as a managed subprocess — no Docker required.

Gralkor automatically remembers and recalls everything your agents says, _thinks_, and _does_ — no prompt engineering required by the operator, no conscious (haha) effort required by the agent.

## Why Gralkor

After years of building with every AI memory system out there, reading the latest research daily, and doing my own cognitive architecture experiments, I am here to tell you a thing or two about AI memory, and why you should use Gralkor for your OpenClaw agents and forget everything else. I should say up front: I love this space and have enormous respect for everyone shipping in it — what follows is honest craft critique, not shade.

Here's the honest field report on every OpenClaw memory plugin:

| Plugin | Storage | Captures thinking | Episode scope | Temporal facts | Local |
|---|---|---|---|---|---|
| **memory-core** *(built-in)* | Markdown files | no | full (LLM-written at compaction) | no | ✓ |
| **lancedb-pro** | LanceDB (flat vector) | no | new messages per run | partial | ✓ |
| **MemOS Local** | SQLite + vector | no | turn delta | recency decay only | ✓ |
| **Cognee** | Cognee graph API | no | Q&A pairs | partial | optional |
| **Supermemory** | Cloud (opaque) | no | last turn only | server-side flag | ✗ |
| **MemOS Cloud** | Cloud (opaque) | no | last turn *(default)* | none | ✗ |
| **Awareness** | Cloud + MD mirror | no | first message + last reply | none | ✗ |
| **Gralkor** | Graphiti knowledge graph | **yes** | full session | `valid_at`/`invalid_at`/`expired_at` | ✓ |

**Graphs, not Markdown or pure vector.** The AI ecosystem's fixation on Markdown-based memory is baffling. Graphs have been the right data structure for representing knowledge since long before LLMs existed. Your code is a graph (syntax trees). Your filesystem is a graph. The web is a graph. Relationships between entities are naturally graph-shaped, and trying to flatten them into Markdown files or pure vector embeddings is fighting reality. And yet: the most popular memory plugin — memory-core, the one that ships inside OpenClaw — writes your agent's memory to `MEMORY.md` and `memory/YYYY-MM-DD.md`. The second most popular, lancedb-pro, stores extracted facts as flat rows in LanceDB. Both make recall a lookup problem when it should be a traversal problem. [Graphiti](https://github.com/getzep/graphiti) combines a knowledge graph with vector search — you get structured relationships *and* semantic retrieval. Facts carry temporal validity: when they became true, when they stopped being true, when they were superseded. This is not yet another chunking strategy or embedding experiment. Graphiti has solved this layer of the problem and we build on top of it (and not much). [Zep's benchmark evaluation](https://arxiv.org/abs/2501.13956) (2025) found graph-based retrieval reaches 71.2% accuracy on long-horizon memory tasks versus 60.2% for flat retrieval. [AriGraph](https://arxiv.org/abs/2407.04363) (IJCAI 2025) independently found KG-augmented agents markedly outperform RAG, summarization, and full-conversation-history baselines across interactive environments.

**Remembering behaviour, not just dialog.** When your agent reasons through a problem — weighing options, rejecting approaches, arriving at a conclusion — that thinking process is as valuable as the final answer. Gralkor distills the agent's thinking blocks into first-person behavioural summaries and weaves them into the episode transcript before ingestion. The graph doesn't just know what was said; it knows how the agent arrived there. *Fighting words*: Every other OpenClaw memory plugin only remembers what was spoken, totally ignoring what your agent thinks and does — lancedb-pro filters for `type === "text"` only, MemOS strips `<think>` tags, Supermemory never looks at them. Even if you have a sophisticated memory system, your agent is inherently dishonest with you, frequently claiming to remember what it has done when it only really remembers what it claimed to have done, or to have thought what it is only now imagining. Gralkor actually remembers what your agent thought and did — it is the only OpenClaw memory plugin with this capability. [Reflexion](https://arxiv.org/abs/2303.11366) (NeurIPS 2023) showed agents storing self-reflective reasoning traces outperform GPT-4 output-only baselines by 11 points on HumanEval. [ExpeL](https://arxiv.org/abs/2308.10144) (AAAI 2024) directly ablated reasoning-trace storage versus output-only: +11–19 points across benchmarks from storing the reasoning process alone.

**On cost.** Yes, Gralkor costs more to run than a Markdown file. Behaviour distillation adds roughly 20% to ingestion token cost. Auto-recall adds an LLM call before each turn when results need interpretation.

Here's the thing though: memory has enormous leverage. A single recalled fact — "we chose postgres over mysql because of the jsonb column support we need for X" — prevents re-litigating that decision in a new session. An agent that remembers your architectural decisions, your preferences, your debugging history, and your reasoning across sessions doesn't just save time; it changes the character of the work. You stop spending turns re-establishing context and start doing the actual work you opened the terminal for.

Paying $15–20/month in API costs to make your agent meaningfully smarter across sessions is not a place to save money. The agents that cost you real money are the ones that forget everything and make you start over.

**Maximum context at ingestion.** Most memory plugins save isolated question-answer pairs or summarized snippets: Awareness stores the first user message and the last assistant reply — a 30-turn debugging session becomes two sentences. Supermemory and MemOS Cloud default to the last turn only. Gralkor captures all messages in each session of work, distills behaviour, and feeds results to Graphiti *as whole episodes*. Extraction works _way_ better when Graphiti has full context rather fragmented QA pairs. *Fighting words*: Other plugins capture single turns of dialog; we capture _the whole episode_ — the entire series of questions, thoughts, actions, and responses that _solved the problem_. Richer semantics, better understanding, better recall. [SeCom](https://arxiv.org/abs/2502.05589) (ICLR 2025) found coherent multi-turn episode storage scores 5.99 GPT4Score points higher than isolated turn-level storage on LOCOMO. [LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025) confirms: fact-level QA-pair extraction drops accuracy from 0.692 to 0.615 versus full-round episode storage.

**Built for the long term.** Graphiti — on which Gralkor is based — is _temporally aware_. On every ingestion, it doesn't just append; it resolves new information against the existing graph, amending, expiring, and invalidating so that your agent knows _what happened over time_. lancedb-pro has something in this direction — an `invalidated_at` timestamp on vector rows, genuinely good — but graph edges are not vector rows: Graphiti tracks four timestamps per fact (`created_at`, `valid_at`, `invalid_at`, `expired_at`) and supports point-in-time queries across a traversable structure. This is expensive, bad for throughput, and useless for short-lived agents, so serving a single, long-lived user agent is _the perfect use case_. Graphiti was destined for Gralkor and OpenClaw. [LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025) established that temporal reasoning is the hardest memory sub-task for commercial LLMs; time-aware indexing recovers 7–11% of that loss. [MemoTime](https://arxiv.org/abs/2510.13614) (WWW 2026) found temporal knowledge graphs enable a 4B model to match GPT-4-Turbo on temporal reasoning, with up to 24% improvement over static memory baselines.

**Recursion through reflection.** A knowledge graph is a living structure. The most powerful thing you can do with it is point the agent back at its own memory — let it reflect on what it knows, identify contradictions, synthesize higher-order insights, and do with them whatever you believe to be _good cognitive architecture_ :shrug:. Gralkor doesn't prescribe how you do this. Instead, it provides the platform for cognitive architecture experimentation: a structured, temporally-aware graph that the agent can both read from and write to using OpenClaw crons.

```bash
# Example: schedule the agent to reflect on its memory every 6 hours
openclaw cron add --every 6h --prompt "Search your memory for recent facts. \
Look for contradictions, outdated information, or patterns worth consolidating. \
Use memory_add to store any new insights."
```

This is where it gets interesting. The graph gives you a substrate for experimentation — reflection strategies, knowledge consolidation, cross-session reasoning — that flat retrieval systems simply cannot support. [Reflexion](https://arxiv.org/abs/2303.11366) (NeurIPS 2023) demonstrated that agents storing verbal reflections in an episodic buffer gain 11 points with no weight updates. [Generative Agents](https://arxiv.org/abs/2304.03442) (UIST 2023) showed empirically that a reflection layer synthesizing raw memories into higher-order insights is essential for coherent long-term behavior.

**Custom ontology: model your agent's world _your way_.** Define your own entity types, attributes, and relationships so that information is parsed into the language of your domain — or your life. [Apple's ODKE+](https://arxiv.org/abs/2509.04696) (2025) showed ontology-guided extraction hits 98.8% precision vs 91% raw LLM; [Text2KGBench](https://arxiv.org/abs/2308.02357) (ISWC 2023), the standard benchmark for ontology-constrained extraction across 29 ontologies, confirms that schema constraints substantially reduce hallucinations and improve conformance versus unconstrained LLM extraction. No other OpenClaw memory plugin offers this. If you want extraction to speak your domain's language: lancedb-pro has six hardcoded categories you can filter but not extend; Supermemory lets you write a free-text hint to guide extraction; the rest offer nothing. Custom ontologies give your agent a model of the world: you could use a domain model codified by experts, be the expert, or try to encode _your_ model of the world. Agent memory doesn't have to be so fuzzy that you lose track of what matters.

## What it does

Gralkor replaces the native memory plugin entirely, taking the memory slot.

- **`memory_search`** — searches the knowledge graph and returns relevant facts
- **`memory_add`** — stores information in the knowledge graph; Graphiti extracts entities and relationships
- **`memory_build_indices`** — rebuilds search indices and constraints (maintenance)
- **`memory_build_communities`** — detects and builds entity communities/clusters to improve search quality (maintenance)
- Hooks: auto-capture (stores full multi-turn conversations after each agent run), auto-recall (injects relevant facts before the agent responds)
- Set up: `plugins.slots.memory = "gralkor"` in `openclaw.json`

## Quick Start

### 1. Prerequisites

- OpenClaw >= 2026.1.26
- Python 3.12+ on the system PATH
- `uv` on PATH ([install](https://docs.astral.sh/uv/getting-started/installation/))
- An API key for a supported LLM provider (see below)

### 2. Configure before installing

Config must be set **before** `plugins.allow`, because OpenClaw validates all listed plugins' config on every write.

```bash
# Required: data directory for persistent state (venv, FalkorDB database).
# Choose a path YOU control — Gralkor has no default.
# This directory survives plugin reinstalls; the plugin dir does not.
openclaw config set plugins.entries.gralkor.config.dataDir /path/to/gralkor-data

# Required: LLM API key for knowledge extraction.
# Gemini is the default provider (LLM + embeddings + reranking, one key).
openclaw config set plugins.entries.gralkor.config.googleApiKey 'your-key-here'

# Optional
openclaw config set plugins.entries.gralkor.config.test true
```

### 3. Install the plugin

```bash
openclaw plugins install @susu-eng/gralkor
```

OpenClaw checks ClawHub before npm for bare package specs, so this installs from ClawHub automatically. To be explicit:

```bash
openclaw plugins install clawhub:@susu-eng/gralkor
```

From a tarball (e.g. for air-gapped deploys):

```bash
openclaw plugins install ./susu-eng-gralkor-memory-26.0.14.tgz --dangerously-force-unsafe-install
```

### 4. Enable and assign the memory slot

```bash
# Allowlist (if you use one)
openclaw config set --json plugins.allow '["gralkor"]'

# Assign the memory slot — replaces the built-in memory-core
openclaw config set plugins.slots.memory gralkor
```

### 5. Restart and go

Restart OpenClaw. On first start, Gralkor automatically:
- Creates a Python virtual environment in `dataDir/venv/`
- Installs Graphiti and its dependencies (~1-2 min first time)
- Starts the Graphiti server with embedded FalkorDB
- Subsequent restarts are fast (venv reused)

Verify the plugin loaded:

```bash
openclaw plugins list
openclaw gralkor status
```

Start chatting with your agent. Gralkor works in the background:
- **Auto-capture**: Full multi-turn conversations are stored in the knowledge graph after each agent run
- **Auto-recall**: Before the agent responds, relevant facts and entities are retrieved and injected as context

### Reinstalling / upgrading

The plugin dir (`~/.openclaw/extensions/gralkor`) is ephemeral — it can be deleted and reinstalled freely. The `dataDir` is persistent — the venv and FalkorDB database survive across reinstalls.

To reinstall:

```bash
# Clear the memory slot first (otherwise install fails config validation)
openclaw config set plugins.slots.memory ""

# Remove old plugin code
rm -rf ~/.openclaw/extensions/gralkor

# Reinstall
openclaw plugins install @susu-eng/gralkor

# Re-assign slot
openclaw config set plugins.slots.memory gralkor
```

The second boot is fast (~4s) because the venv in `dataDir` is reused.

### LLM providers

Graphiti needs an LLM to extract entities and relationships from conversations.

| Provider | Config field | Notes |
|---|---|---|
| **Google Gemini** (default) | `googleApiKey` | Fully self-contained (LLM + embeddings + reranking) |
| **OpenAI** | `openaiApiKey` | Handles LLM + embeddings out of the box |
| **Anthropic** | `anthropicApiKey` | LLM only — still needs `openaiApiKey` for embeddings |
| **Groq** | `groqApiKey` | LLM only — still needs `openaiApiKey` for embeddings |

To switch away from Gemini, set `llm` and `embedder` in the plugin config. For example, with OpenAI:

```json
{
  "plugins": {
    "entries": {
      "gralkor": {
        "enabled": true,
        "config": {
          "dataDir": "/path/to/gralkor-data",
          "openaiApiKey": { "$ref": "env:OPENAI_API_KEY" },
          "llm": { "provider": "openai", "model": "gpt-4.1-mini" },
          "embedder": { "provider": "openai", "model": "text-embedding-3-small" }
        }
      }
    }
  }
}
```

## CLI

```bash
openclaw gralkor status              # Server state, config, graph stats, data dir, venv
openclaw gralkor search <group_id> <query>  # Search the knowledge graph
```

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
| `autoRecall.maxResults` | `10` | Maximum number of facts injected as context by auto-recall |
| `search.maxResults` | `20` | Maximum number of facts returned by the `memory_search` tool |
| `search.maxEntityResults` | `10` | Maximum number of entity summaries returned by the `memory_search` tool |
| `idleTimeoutMs` | `300000` | How long (ms) after the last agent response to wait before flushing buffered messages to the graph. Prevents data loss when sessions aren't explicitly ended (e.g. user walks away, gateway restarts). Set to `0` to disable idle flushing. |
| `dataDir` | **(required)** | Directory for persistent backend data (Python venv, FalkorDB database). No default — operator must set. |
| `test` | `false` | Test mode — logs full episode bodies and search results at plugin boundaries for debugging |

### Complete config reference

```json
{
  "plugins": {
    "entries": {
      "gralkor": {
        "enabled": true,
        "config": {
          "dataDir": "/path/to/gralkor-data",
          "workspaceDir": "~/.openclaw/workspace",
          "googleApiKey": "your-gemini-key",
          "llm": { "provider": "gemini", "model": "gemini-3.1-flash-lite-preview" },
          "embedder": { "provider": "gemini", "model": "gemini-embedding-2-preview" },
          "autoCapture": { "enabled": true },
          "autoRecall": { "enabled": true, "maxResults": 10 },
          "search": { "maxResults": 20, "maxEntityResults": 10 },
          "idleTimeoutMs": 300000,
          "ontology": {
            "entities": {},
            "edges": {},
            "edgeMap": {}
          },
          "test": false
        }
      }
    }
  }
}
```

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

### Reserved names

The following entity names are used internally by Graphiti and cannot be used: `Entity`, `Episodic`, `Community`, `Saga`.

## Data storage

`dataDir` is a required config field — the operator chooses where persistent data lives:
- `venv/` — Python virtual environment (Graphiti, FalkorDBLite, etc.)
- `falkordb/` — embedded FalkorDB database files

By keeping `dataDir` outside the plugin install directory, `openclaw plugins uninstall` and reinstall won't destroy the graph database. The operator controls the lifecycle of this directory.

```bash
openclaw config set plugins.entries.gralkor.config.dataDir /data/gralkor
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

Graphiti handles the heavy lifting: entity extraction, relationship mapping, temporal tracking, and embedding-based search. Gralkor wires it into the OpenClaw plugin lifecycle. The Graphiti server and embedded FalkorDB run as a managed subprocess — started and stopped automatically by the plugin.

## Troubleshooting

**`openclaw gralkor status` says "Server process: stopped"**
Python 3.12+ is not found on the system PATH. Install Python 3.12+ and restart OpenClaw.

**First startup takes a long time**
Normal — Gralkor is creating a Python virtual environment and installing dependencies via pip. This takes ~1-2 minutes. Subsequent starts reuse the venv and skip pip.

**Plugin loads but all graph operations fail**
Most likely: missing or invalid LLM API key. Check your provider API key configuration.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true` (it is by default)
- Verify the graph has data: run `openclaw gralkor search <term>`
- Auto-recall extracts keywords from the user's message — very short messages may not match

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true` (it is by default)
- Conversations are flushed to the graph when the session ends or after 5 minutes of inactivity (configurable via `idleTimeoutMs`). On SIGTERM, all pending buffers are flushed before shutdown. If the process receives SIGKILL without prior SIGTERM, buffered messages may be lost.
- Conversations where the first user message starts with `/` are skipped by design
- Empty conversations (no extractable text) are skipped

**Agent doesn't have plugin tools (`memory_add`, `memory_build_indices`, etc.)**
OpenClaw's tool profiles (`coding`, `minimal`, etc.) only allowlist core tools by default. Plugin tools are filtered out when a profile is active. To enable them, add them to `alsoAllow` in your `openclaw.json`:

```json
{
  "tools": {
    "alsoAllow": ["memory_add", "memory_build_indices", "memory_build_communities"]
  }
}
```

You can also allow all Gralkor tools with `"alsoAllow": ["gralkor"]` or all plugin tools with `"alsoAllow": ["group:plugins"]`. Note that `memory_add` is not required for Gralkor to work — auto-capture already stores everything your agent hears, says, thinks, and does. `memory_add` is only needed if you want the agent to selectively store specific insights or conclusions on its own.

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
