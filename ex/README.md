# gralkor

OTP supervisor for [Gralkor](https://github.com/elimydlarz/gralkor) — a temporally-aware knowledge-graph memory service (Graphiti + FalkorDB) wrapped as a Python/FastAPI server.

Embed `Gralkor.Server` in your Jido (or any Elixir) supervision tree. The GenServer spawns the Python server as a Port, polls `/health` during boot, monitors it, and handles graceful shutdown. Your application talks to it over HTTP on a loopback port.

## Prerequisites

- `uv` on `PATH` (the Elixir supervisor spawns the Python server via `uv run uvicorn …`).
- An LLM provider API key — `GOOGLE_API_KEY` (default provider) or one of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GROQ_API_KEY`.
- A writable directory for FalkorDB + generated `config.yaml` (`GRALKOR_DATA_DIR`).

The Python source ships inside the package (`priv/server/`); no separate clone or Docker image needed.

**Auth:** the server binds to loopback and expects its consumer to supervise it — so there is no authentication. All endpoints are mounted on a single router with no middleware. If a multi-host or shared-service deployment ever changes the threat model, add a bearer-token dependency on the Python side and attach `Authorization: Bearer …` on the client.

## Install

```elixir
def deps do
  [
    {:gralkor, "~> 0.1"}
  ]
end
```

During pre-release iteration, path-dep instead:

```elixir
{:gralkor, path: "../gralkor/ex"}
```

## Installing into a Jido agent (e.g. Susu2)

Jido consumers embed Gralkor in their own supervision tree and talk to it over loopback HTTP. The consumer side — `Susu2.Gralkor.{Client, Plugin, Connection}` + memory actions — is the canonical pattern; this package is what they supervise.

1. **Add the dep** (see above).

2. **Supervise `Gralkor.Server`** in the consumer app, **before** any health-poller / plugin that depends on it:

   ```elixir
   # lib/susu2/application.ex
   def start(_type, _args) do
     children = [
       Susu2.Users,
       Gralkor.Server,                # owns the Python child via Port
       Susu2.Gralkor.Connection,      # boot-readiness gate + health monitor
       Susu2.Jido,
       ExGram,
       {Susu2.Bot, [method: :polling, token: bot_token()]}
     ]

     Supervisor.start_link(children, strategy: :one_for_one, name: Susu2.Supervisor)
   end
   ```

   `Gralkor.Server.init/1` is non-blocking (`{:continue, :boot}`), so OTP ordering is safe: `Susu2.Gralkor.Connection` starts immediately after and health-polls until the Python child is ready. `Gralkor.Server` reads its config from env vars (`Gralkor.Config.from_env/0`).

3. **Set env vars** (e.g. in a `.env` file sourced at boot, or via systemd/container config):

   ```bash
   export GRALKOR_DATA_DIR=/var/lib/susu2/gralkor
   export GOOGLE_API_KEY=<your-key>          # or ANTHROPIC/OPENAI/GROQ
   # optional:
   # export GRALKOR_URL=http://127.0.0.1:4000  # default
   ```

   The consumer reads `GRALKOR_URL` and writes it into its own app env (e.g. `Application.put_env(:susu2, :gralkor, url: ...)`) for the HTTP client.

4. **Wire the plugin + actions on your agent:**

   ```elixir
   # lib/susu2/chat_agent.ex
   use Jido.Agent,
     name: "susu2_chat",
     strategy:
       {Jido.AI.Reasoning.ReAct.Strategy,
        tools: [Susu2.Gralkor.Actions.MemorySearch, Susu2.Gralkor.Actions.MemoryAdd]},
     default_plugins: %{__memory__: false},
     plugins: [{Susu2.Gralkor.Plugin, %{}}]
   ```

   `default_plugins: %{__memory__: false}` disables Jido's built-in memory plugin so `Susu2.Gralkor.Plugin` owns the `:__memory__` state slot. The plugin hooks `ai.react.query` (auto-recall) and `ai.request.completed` / `ai.request.failed` (auto-capture). The plugin and actions both call through `Susu2.Gralkor.Client` — swap the impl to `Susu2.Gralkor.Client.InMemory` in test config, keep `Susu2.Gralkor.Client.HTTP` for dev/prod.

   **Session identity.** Gralkor's capture buffer is keyed by `session_id`, which the plugin takes from `agent.state.__strategy__.thread.id` (the current `Jido.AI.Thread`). One Jido conversation thread per Gralkor session — concurrent agents for the same principal never collide on the buffer, and the session rotates naturally when the thread rotates. `group_id` is the sanitized `agent.id` (per-principal graph partition).

5. **Verify boot.** `iex -S mix` → `curl http://127.0.0.1:4000/health` → `{"status":"ok",…}`. Send a message through the bot; watch for `POST /recall` then (after the capture idle window) `[gralkor] episode added …` in the logs.

No Docker, no separate Gralkor service. `mix deps.get` + `iex -S mix` brings the whole memory stack up.

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
- `GET /health` — liveness probe.

All endpoints are unauthenticated — see the Auth note above.

## Lifecycle

`Gralkor.Server`:

- `init/1` returns `{:ok, state, {:continue, :boot}}` — never blocks.
- `handle_continue(:boot, …)` writes `config.yaml`, spawns `uv run uvicorn main:app`, health-polls at 500ms until 200 or a configurable boot timeout, then schedules a 60s monitor.
- `terminate/2` sends `SIGTERM` to the OS pid and waits up to 30s for clean exit before `SIGKILL`.

## Running locally

From `ex/`:

```bash
export GRALKOR_DATA_DIR=/tmp/gralkor-dev
export GOOGLE_API_KEY=...           # or ANTHROPIC_API_KEY / OPENAI_API_KEY / GROQ_API_KEY
iex -S mix
```

`curl http://127.0.0.1:4000/health` should return `200`.

## License

MIT.
