# Gralkor — Install Instructions

Persistent knowledge-graph memory for OpenClaw agents.
Powered by [Graphiti](https://github.com/getzep/graphiti) + [FalkorDB](https://www.falkordb.com/).

## Prerequisites

- OpenClaw >= 2026.1.26
- Docker and Docker Compose
- An LLM provider API key (one of: `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY` + `OPENAI_API_KEY`, `GROQ_API_KEY` + `OPENAI_API_KEY`)

## Choose a mode

**Memory mode** — replaces native memory with a unified interface (native Markdown + knowledge graph). Install this unless you have a reason not to.

**Tool mode** — adds `graph_search`/`graph_add` tools alongside the existing native memory plugin. Use this if you want to keep native memory separate.

## Install

### 1. Install the plugin

**From npm (recommended):**

```bash
# Memory mode
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
# Memory mode (recommended)
openclaw plugins install ./openclaw-gralkor-memory-<version>.tgz

# OR tool mode
openclaw plugins install ./openclaw-gralkor-tool-<version>.tgz
```

### 2. Configure the LLM provider

Navigate to the plugin's installed directory and create a `.env` file from the example:

```bash
cd ~/.openclaw/plugins/gralkor
cp .env.example .env
```

Edit `.env` and set your API key. The simplest option is OpenAI (handles both LLM and embeddings):

```
OPENAI_API_KEY=sk-...
```

For Google Gemini (fully self-contained, no OpenAI key needed):

```
GOOGLE_API_KEY=...
```

If using Gemini, also update `config.yaml` in the same directory:

```yaml
llm:
  provider: "gemini"
  model: "gemini-2.5-flash"

embedder:
  provider: "gemini"
  model: "text-embedding-004"
```

### 3. Start the backend services

```bash
cd ~/.openclaw/plugins/gralkor
docker build -t gralkor-server:latest server/
docker compose up -d
```

Verify Graphiti is running:

```bash
curl http://localhost:8001/health
```

### 4. Enable the plugin in OpenClaw

**Memory mode** — set the memory slot in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "slots": {
      "memory": "gralkor"
    }
  }
}
```

**Tool mode** — add to the enabled plugins list in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "enabled": ["gralkor"]
  }
}
```

### 5. Verify

Restart OpenClaw and check the plugin loaded:

```bash
openclaw plugins list
```

The agent should now have access to:
- **Memory mode:** `memory_search`, `memory_get`, `memory_add`
- **Tool mode:** `graph_search`, `graph_add`

## Network setup for OpenClaw container

If OpenClaw runs in Docker, connect it to the `gralkor` network so it can reach Graphiti at `http://graphiti:8001`:

```bash
docker network connect gralkor <openclaw-container>
```

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Plugin loads but all graph operations fail | Missing LLM API key | Set the key in `.env` and restart services |
| `memory_search` returns empty results | No embedding provider for native memory | Set `OPENAI_API_KEY` in `~/.openclaw/.env` (gateway env) |
| Graphiti container exits immediately | FalkorDB not ready | Wait a few seconds and `docker compose up -d` again |
| `curl localhost:8001/health` fails | Services not running | Run `docker compose up -d` from the plugin directory |
