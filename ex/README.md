# gralkor

OTP supervisor for [Gralkor](https://github.com/elimydlarz/gralkor) — a temporally-aware knowledge-graph memory service (Graphiti + FalkorDB) wrapped as a Python/FastAPI server.

Embed `Gralkor.Server` in your Jido (or any Elixir) supervision tree. The GenServer spawns the Python server as a Port, polls `/health` during boot, monitors it, and handles graceful shutdown. Your application talks to it over HTTP on a loopback port.

## Install

```elixir
def deps do
  [
    {:gralkor, "~> 0.1"}
  ]
end
```

The Python source ships inside the package (`priv/server/`). `uv` must be on the `PATH` of the runtime environment.

## Usage

Add `Gralkor.Server` to your supervision tree and configure via env vars:

```elixir
# application.ex
children = [
  # ... your other children
  Gralkor.Server
]
```

Required env vars:

- `GRALKOR_DATA_DIR` — writable directory for the FalkorDB database + generated `config.yaml`.
- `GRALKOR_AUTH_TOKEN` — bearer token protecting the HTTP endpoints.

Optional:

- `GRALKOR_SERVER_URL` — default `http://127.0.0.1:4000`.
- `GRALKOR_SERVER_DIR` — default is the packaged `priv/server/`.
- `GRALKOR_LLM_PROVIDER` / `GRALKOR_LLM_MODEL` — defaults chosen server-side.
- `GRALKOR_EMBEDDER_PROVIDER` / `GRALKOR_EMBEDDER_MODEL` — defaults chosen server-side.
- Provider API keys: `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` (whichever your provider needs).

## HTTP endpoints

Your application talks to Gralkor over HTTP:

- `POST /recall` — before-prompt auto-recall; returns an XML-wrapped memory block.
- `POST /capture` — fire-and-forget turn capture; server buffers + distils + ingests on idle.
- `POST /tools/memory_search` / `POST /tools/memory_add` — agent-facing tools.
- `POST /episodes`, `POST /search`, `POST /distill`, `POST /build-indices`, `POST /build-communities` — lower-level operations.
- `GET /health` — public, no auth.

All non-`/health` endpoints require `Authorization: Bearer <GRALKOR_AUTH_TOKEN>`.

## Lifecycle

`Gralkor.Server`:

- `init/1` returns `{:ok, state, {:continue, :boot}}` — never blocks.
- `handle_continue(:boot, …)` writes `config.yaml`, spawns `uv run uvicorn main:app`, health-polls at 500ms until 200 or a configurable boot timeout, then schedules a 60s monitor.
- `terminate/2` sends `SIGTERM` to the OS pid and waits up to 30s for clean exit before `SIGKILL`.

## Running locally

From `ex/`:

```bash
export GRALKOR_DATA_DIR=/tmp/gralkor-dev
export GRALKOR_AUTH_TOKEN=dev-token
export GOOGLE_API_KEY=...           # or ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY
iex -S mix
```

`curl -H 'Authorization: Bearer dev-token' http://127.0.0.1:4000/health` should return `200`.

## License

MIT.
