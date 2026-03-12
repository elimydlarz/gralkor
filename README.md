# Gralkor — Install Instructions

Persistent knowledge-graph memory for OpenClaw agents.
Powered by [Graphiti](https://github.com/getzep/graphiti) + [FalkorDB](https://www.falkordb.com/).

## Prerequisites

- OpenClaw >= 2026.1.26
- Python 3.12+ on the system PATH
- An LLM provider API key (one of: `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`, `GROQ_API_KEY` + `OPENAI_API_KEY`)

## Install

### 1. Install the plugin

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

### 2. Configure the LLM provider

Navigate to the plugin's installed directory and create a `.env` file from the example:

```bash
cd ~/.openclaw/plugins/gralkor
cp .env.example .env
```

Edit `.env` and set your API key. The simplest option is Google Gemini (fully self-contained — LLM + embeddings + reranking):

```
GOOGLE_API_KEY=...
```

For OpenAI (also handles both LLM and embeddings):

```
OPENAI_API_KEY=sk-...
```

If using OpenAI, also update `config.yaml` in the same directory:

```yaml
llm:
  provider: "openai"
  model: "gpt-4.1-mini"

embedder:
  provider: "openai"
  model: "text-embedding-3-small"
```

### 3. Enable the plugin in OpenClaw

Set the memory slot in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "gralkor"
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

The agent should now have access to: `memory_search`, `memory_get`, `memory_add`.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Plugin loads but all graph operations fail | Missing LLM API key | Set the key in `.env` and restart OpenClaw |
| `memory_search` returns empty results | No embedding provider for native memory | Set `OPENAI_API_KEY` in `~/.openclaw/.env` (gateway env) |
| `gralkor status` says "Server process: stopped" | Python 3.12+ not found on PATH | Install Python 3.12+ and restart OpenClaw |
| First startup takes a long time | Normal — creating venv and installing deps | Wait ~1-2 min; subsequent starts are fast |
