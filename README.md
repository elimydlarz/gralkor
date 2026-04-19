# Gralkor

**The best memory plugin for OpenClaw agents**

Gralkor is an OpenClaw plugin that gives your agents long-term, temporally-aware memory. It uses [Graphiti](https://github.com/getzep/graphiti) (by Zep) for knowledge graph construction and [FalkorDB](https://www.falkordb.com/) as the graph database backend. Both run automatically as a managed subprocess - no independent server for you to manage, or SaaS company to connect to.

Gralkor automatically remembers and recalls everything your agent says, _thinks_, and _does_ — no prompt engineering required by the operator, no conscious (haha) effort required by the agent.

## Why Gralkor

Let's look in detail about the decisions made for Gralkor and why they make it the best memory plugin for OpenClaw.

**Graphs, not Markdown or pure vector.** Graphs are the right data structure for representing knowledge. Your code is a graph - the _world_ is a deeply interrelated graph and trying to flatten it into Markdown files or pure vector embeddings is fighting reality. Gralkor doesn't use MD files (other than indexing yours), and this is not another chunking strategy or embedding experiment. Graphiti has already solved this layer and Gralkor leverages it optimally for this use case.

[HippoRAG](https://arxiv.org/abs/2405.14831) (NeurIPS 2024) found graph-based retrieval reaches 89.1% recall@5 on 2WikiMultiHopQA versus 68.2% for flat vector retrieval — a 20.9-point gap. [AriGraph](https://arxiv.org/abs/2407.04363) (IJCAI 2025) independently found KG-augmented agents markedly outperform RAG, summarization, and full-conversation-history baselines across interactive environments.

**Remembering behaviour, not just dialog.** Agents make mistakes, weigh options, reject approaches - they _learn_ as they complete tasks. Gralkor distills the agent's behaviour - not just its dialog - into first-person behavioural reports weaved into episode transcripts before ingestion.

For almost all other memory plugins, your agent is inherently dishonest with you, frequently claiming to remember what it has done when it only really remembers what it _already claimed_ to have done, or to have thought _what it is only now imagining_.

With Gralkor your agent actually remembers it's thoughts and actions.

[Reflexion](https://arxiv.org/abs/2303.11366) (NeurIPS 2023) showed agents storing self-reflective reasoning traces outperform GPT-4 output-only baselines by 11 points on HumanEval. [ExpeL](https://arxiv.org/abs/2308.10144) (AAAI 2024) directly ablated reasoning-trace storage versus output-only: +11–19 points across benchmarks from storing the reasoning process alone.

**Maximum context at ingestion.** Gralkor captures all messages in each session of work, distills behaviour, and feeds results to Graphiti *as whole episodes*. Extraction works _way_ better when Graphiti has full context.

Most memory plugins save isolated question-answer pairs or summarized snippets: Some store only the first user message and the last assistant reply, others store to the last turn only.

Gralkor captures the entire series of questions, thoughts, actions, and responses that _solved the problem_ together, with all their interrelationships. Richer semantics, better understanding, better recall.

[SeCom](https://arxiv.org/abs/2502.05589) (ICLR 2025) found coherent multi-turn episode storage scores 5.99 GPT4Score points higher than isolated turn-level storage on LOCOMO. [LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025) confirms: fact-level QA-pair extraction drops accuracy from 0.692 to 0.615 versus full-round episode storage.

**Built for the long term.** Graphiti (and therefore Gralkor) is deeply temporal. On every ingestion, it doesn't just append; it resolves new information against the existing graph, amending, expiring, and invalidating so that your agent knows _what happened over time_.

Graphiti does the heavy temporal lifting on ingestion. It's bad for throughput, and useless for short-lived agents, which means serving a single, long-lived user agent is _the perfect use case_.

[LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025) established that temporal reasoning is the hardest memory sub-task for commercial LLMs; time-aware indexing recovers 7–11% of that loss. [MemoTime](https://arxiv.org/abs/2510.13614) (WWW 2026) found temporal knowledge graphs enable a 4B model to match GPT-4-Turbo on temporal reasoning, with up to 24% improvement over static memory baselines.

**Recursion through reflection.** Point your agent back at its own memory — let it reflect on what it knows, identify contradictions, synthesize higher-order insights, and do with them whatever you believe to be _good cognitive architecture_. Gralkor doesn't limit you to one approach, but the research is quite clear - you should do _something_.

My way is to use cron and [Thinker CLI](https://github.com/elimydlarz/thinker-cli) together, directing the agent to use the search and add memory tools in a sequential reflective process. Share yours, and ask to see mine.

[Reflexion](https://arxiv.org/abs/2303.11366) (NeurIPS 2023) demonstrated that agents storing verbal reflections in an episodic buffer gain 11 points with no weight updates. [Generative Agents](https://arxiv.org/abs/2304.03442) (UIST 2023) showed empirically that a reflection layer synthesizing raw memories into higher-order insights is essential for coherent long-term behavior.

**Custom ontology: model your agent's world _your way_.** Gralkor lets you define your own entity types, attributes, and relationships so that information is parsed into entities and relationships you define. Your graph doesn't have to be a black box - you can keep track of what matters to you.

You can use a domain model codified by experts in your field, or encode _your_ model of the world so that your agent shares it.

[Apple's ODKE+](https://arxiv.org/abs/2509.04696) (2025) showed ontology-guided extraction hits 98.8% precision vs 91% raw LLM; [GoLLIE](https://arxiv.org/abs/2310.03668) (ICLR 2024) directly ablated schema-constrained versus unconstrained generation on the same model, finding +13 F1 points average across NER, relation, and event extraction in zero-shot settings.

**Interpretation** Gralkor interprets information in memory for relevance to the task at hand. This step radically improves output with minimal impact on cost and latency.

**On cost.** Gralkor costs more to run than a Markdown file in the short term. In the longer term, Gralkor provides more efficient context management, reducing token burn. Instead of paying to pollute your context window with junk every read, you pay more on ingestion in exchange for cheap, high-relevance reads forever.

An agent that remembers behaviour, decisions, your preferences, and reasoning across sessions changes the _character_ of your work. You stop spending turns re-establishing context and focus more on what you care about. A single recalled behavioural fact — "we rejected mysql because it lacked jsonb column support needed for X" — prevents re-litigating that decision in a new session - it might save 10 subagents repeating a parallel investigation of database options.

Gralkor is _good_ memory, not cheap memory. You can push the llm choice and perhaps get better extraction, but otherwise I've just made it as good as possible while being reasonable about latency.

## Tools

- **`memory_search`** — searches the knowledge graph and returns relevant facts and entity summaries
- **`memory_add`** — stores information in the knowledge graph; Graphiti extracts entities and relationships
- **`memory_build_indices`** — rebuilds search indices and constraints (maintenance)
- **`memory_build_communities`** — detects and builds entity communities/clusters to improve search quality (maintenance)
- Hooks: auto-capture (stores full multi-turn conversations after each agent run), auto-recall (injects relevant facts before the agent responds)
- Set up: `plugins.slots.memory = "gralkor"` in `openclaw.json`

## Using Gralkor from a Jido (Elixir) agent

Gralkor is primarily an OpenClaw plugin, but the Python server exposes a harness-agnostic HTTP API so Elixir/Jido agents can use it too. The Elixir supervisor in `ex/` runs Gralkor as a managed subprocess either embedded in your Jido app's supervision tree (dev) or as a standalone container (production).

**HTTP endpoints** (unauthenticated — loopback-only; consumer supervises the server):

- `POST /recall` — before-prompt auto-recall
- `POST /capture` — fire-and-forget turn capture (server buffers, distils, ingests on idle)
- `POST /session_end` — flush the session's buffer now (fire-and-forget; 204 before the graph write); for consumers that know when a session is over
- `POST /tools/memory_search`, `POST /tools/memory_add` — consumer-facing tools
- `POST /distill` — standalone distillation (for clients that want raw distill access)
- Existing: `POST /episodes`, `POST /search`, `GET /health`

Add Gralkor as a mix dependency (path or Hex) and supervise `Gralkor.Server` in your Jido app's supervision tree. The GenServer spawns uvicorn via a Port, polls `/health`, and handles graceful shutdown (SIGTERM → buffer flush → SIGKILL). `mix deps.get` + `iex -S mix` brings the whole memory stack up; OTP supervision owns the lifecycle.

Full installation and wiring recipe for a Jido consumer (e.g. Susu2) is in [`ex/README.md`](./ex/README.md).

## Quick Start

### 1. Prerequisites

- OpenClaw 2026.4.2
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
openclaw plugins install @susu-eng/gralkor@latest --dangerously-force-unsafe-install
```

> **Why `--dangerously-force-unsafe-install`?** OpenClaw's install-time security scanner flags Gralkor as critical because of the embeeded Python server. Inspect the source if you'd like to verify there's nothing weird going on.

### 4. Enable and assign the memory slot

OpenClaw has a single `memory` slot that determines which plugin provides memory to your agents. You must explicitly assign Gralkor to the `memory` slot, otherwise installing the plugin does nothing — auto-capture and auto-recall hooks will never fire.

```bash
# If you use an allowlist, add gralkor to it
openclaw config set --json plugins.allow '["gralkor"]'

# Enable the plugin entry
openclaw config set plugins.entries.gralkor.enabled true

# Assign Gralkor to the memory slot (replaces the built-in memory-core)
openclaw config set plugins.slots.memory gralkor

# Expose Gralkor's tools to the agent. Auto-capture and auto-recall work without
# this, but the agent won't see memory_add / memory_build_indices / memory_build_communities
# unless you add them to the active tool profile's allowlist.
openclaw config set --json tools.alsoAllow '["gralkor"]'
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

### Upgrading

```bash
openclaw plugins update gralkor@latest --dangerously-force-unsafe-install
```

### LLM providers

Graphiti needs an LLM to extract entities and relationships from conversations.

| Provider | Config field | Notes |
|---|---|---|
| **Google Gemini** (default) | `googleApiKey` | Fully self-contained (LLM + embeddings + reranking) |
| **OpenAI** | `openaiApiKey` | Handles LLM + embeddings out of the box |
| **Anthropic** | `anthropicApiKey` | LLM only — still needs `openaiApiKey` for embeddings |
| **Groq** | `groqApiKey` | LLM only — still needs `openaiApiKey` for embeddings |

To switch away from Gemini, set `llm` and `embedder`. For example, with OpenAI:

```bash
openclaw config set plugins.entries.gralkor.config.openaiApiKey "$OPENAI_API_KEY"
openclaw config set --json plugins.entries.gralkor.config.llm '{"provider":"openai","model":"gpt-4.1-mini"}'
openclaw config set --json plugins.entries.gralkor.config.embedder '{"provider":"openai","model":"text-embedding-3-small"}'
```

## CLI

```bash
openclaw gralkor status              # Server state, config, graph stats, data dir, venv
openclaw gralkor search <group_id> <query>  # Search the knowledge graph
```

See [Graph partitioning](#graph-partitioning) for what `<group_id>` should be.

## Configuration

Configure with `openclaw config set`. For example:

```bash
openclaw config set --json plugins.entries.gralkor.config.autoRecall.maxResults 20
openclaw config set --json plugins.entries.gralkor.config.idleTimeoutMs 600000
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

The full plugin config shape (as it appears under `plugins.entries.gralkor.config` in `~/.openclaw/openclaw.json`):

```json
{
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
```

### Graph partitioning

Each agent gets its own graph partition automatically — different agents won't see each other's knowledge, and no configuration is needed.

The partition key (`group_id`) is the agent's ID with hyphens replaced by underscores (FalkorDB's RediSearch syntax doesn't accept hyphens). So an agent named `my-coding-agent` stores its memory under group `my_coding_agent`. Agents running without an explicit ID use the partition `default`. You'll need this `group_id` whenever you query the graph directly — e.g. `openclaw gralkor search <group_id> <query>`.

## Custom entity and relationship types

By default, Graphiti extracts generic entities and connects them with generic `RELATES_TO` relationships. This works well out of the box — you don't need to configure anything for Gralkor to be useful.

If you want more structured extraction, you can define custom entity and relationship types. Graphiti will classify entities into your types, extract structured attributes, and create typed relationships between them.

### Entities

The simplest useful ontology defines just entity types. Relationships will still be created, using Graphiti's default `RELATES_TO` type. Set the whole ontology in one go:

```bash
openclaw config set --json plugins.entries.gralkor.config.ontology '{
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
}'
```

### Relationships

To control how entities are connected, add `edges` (relationship types) and `edgeMap` (which entity pairs they apply to):

```json
{
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
```

Apply with `openclaw config set --json plugins.entries.gralkor.config.ontology '<above>'`.

Without `edgeMap`, all edge types can connect any entity pair. With `edgeMap`, relationships are constrained to specific pairs — entity pairs not listed fall back to `RELATES_TO`.

### Attributes

Attributes control what Graphiti extracts for each entity or relationship. They are **required fields** — if the LLM can't populate them from the text, it won't extract that entity type at all. This makes attributes the primary mechanism for gating extraction quality.

| Format | Example | Generated type | Gating strength |
|---|---|---|---|
| String | `"language": "Primary programming language"` | Required `str` field | Weak — any text satisfies it |
| Enum (array) | `"status": ["active", "completed", "paused"]` | Required `Literal` enum | Strong — must pick a valid value |
| Typed object | `"budget": { "type": "float", "description": "Budget in USD" }` | Required typed field | Medium — must be valid type |
| Enum with description | `"priority": { "enum": ["low", "high"], "description": "Priority level" }` | Required `Literal` enum | Strong |

Supported types for the object form: `string`, `int`, `float`, `bool`, `datetime`.

### Descriptions

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
 ┌──────────────┐    search    ┌──────────────┐    query     ┌──────────────┐
 │ auto-recall  │ ───────────▶ │   Graphiti   │ ───────────▶ │   FalkorDB   │
 │    hook      │ ◀─────────── │     API      │ ◀─────────── │              │
 └──────────────┘    facts     └──────────────┘   subgraph   └──────────────┘
        │
        ▼
 Agent runs (with recalled facts as context)
        │
        ▼
 ┌──────────────┐    ingest    ┌──────────────┐   extract    ┌──────────────┐
 │ auto-capture │ ───────────▶ │   Graphiti   │ ───────────▶ │   FalkorDB   │
 │    hook      │              │     API      │  entities    │              │
 └──────────────┘              └──────────────┘   & facts    └──────────────┘
```

Graphiti handles the heavy lifting: entity extraction, relationship mapping, temporal tracking, and embedding-based search. Gralkor wires it into the OpenClaw plugin lifecycle. The Graphiti server and embedded FalkorDB run as a managed subprocess — started and stopped automatically by the plugin.

## Troubleshooting

**`openclaw gralkor status` says "Server process: stopped"**
Many things can cause this. Use the available diagnostics to narrow it down:

- **`openclaw gralkor status`** — shows process state, config summary, `dataDir`, venv state, and (if unreachable) the connection error
- **Gateway logs** — grep for `[gralkor] boot:` markers. You should see `boot: plugin loaded`, `boot: starting`, then `boot: ready`. A `boot: ... failed:` line tells you which stage broke
- **`openclaw gralkor search <group_id> <query>`** — quick end-to-end check that the server is reachable and the graph has data (group ID is required; it's the agent ID with hyphens replaced by underscores)

Common causes:
- `uv` not on PATH (Python itself is managed by `uv` — it fetches 3.12+ on demand and produces its own errors)
- `uv sync` failed (network/registry issue, or on first boot ~1–2 min is normal — wait it out)
- Missing or invalid LLM API key — the server starts but every operation fails
- Stale `server.pid` in `dataDir` holding port 8001 (the manager tries to clean this up, but a SIGKILL'd predecessor can leave the port wedged)
- On `linux/arm64`: bundled falkordblite wheel couldn't be resolved (not in `server/wheels/`, not cached in `dataDir/wheels/`, and the GitHub Release download failed)

**First startup takes a long time**
Normal — Gralkor is creating a Python virtual environment and installing dependencies via pip. This takes ~1-2 minutes. Subsequent starts reuse the venv and skip pip.

**Plugin loads but all graph operations fail**
Most likely: missing or invalid LLM API key. Check your provider API key configuration.

**No memories being recalled**
- Check that `autoRecall.enabled` is `true` (it is by default)
- Verify the graph has data: run `openclaw gralkor search <group_id> <term>` (group ID = agent ID with hyphens replaced by underscores)
- Auto-recall extracts keywords from the user's message — very short messages may not match

**Agent doesn't store conversations**
- Check that `autoCapture.enabled` is `true` (it is by default)
- Conversations are flushed to the graph when the session ends or after 5 minutes of inactivity (configurable via `idleTimeoutMs`). On SIGTERM, all pending buffers are flushed before shutdown. If the process receives SIGKILL without prior SIGTERM, buffered messages may be lost.
- Conversations where the first user message starts with `/` are skipped by design
- Empty conversations (no extractable text) are skipped

