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

### Installing into a Jido agent (e.g. Susu2)

Jido consumers embed Gralkor in their own supervision tree and talk to it over loopback HTTP. The consumer side — `Susu2.Gralkor.{Client, Plugin, Connection}` + memory actions — is already the canonical pattern; this package is what they supervise.

1. **Add the dep** to the Jido app's `mix.exs`:

   ```elixir
   defp deps do
     [
       # ... your other deps (jido, jido_ai, etc.)
       {:gralkor, "~> 0.1"}
     ]
   end
   ```

   During pre-release iteration you can path-dep instead: `{:gralkor, path: "../gralkor/ex"}`.

2. **Supervise `Gralkor.Server`** in the consumer app, **before** any health-poller / plugin that depends on it:

   ```elixir
   # lib/susu2/application.ex
   def start(_type, _args) do
     children = [
       Gralkor.Server,                # owns the Python child via Port
       Susu2.Gralkor.Connection,      # boot-readiness gate + health monitor
       Susu2.Users,
       Susu2.Jido,
       ExGram,
       {Susu2.Bot, [method: :polling, token: bot_token()]}
     ]

     Supervisor.start_link(children, strategy: :one_for_one, name: Susu2.Supervisor)
   end
   ```

   `Gralkor.Server.init/1` is non-blocking (`{:continue, :boot}`), so OTP ordering is safe: `Susu2.Gralkor.Connection` starts after `Gralkor.Server` returns `:ok`, then polls `/health` during its own boot window until the Python child is up.

3. **Configure via env vars** (e.g. in `config/runtime.exs` or the runtime environment):

   ```elixir
   # config/runtime.exs
   config :susu2, :gralkor,
     url: System.get_env("GRALKOR_URL", "http://127.0.0.1:4000"),
     token: System.fetch_env!("GRALKOR_AUTH_TOKEN")
   ```

   ```bash
   export GRALKOR_DATA_DIR=/var/lib/susu2/gralkor
   export GRALKOR_AUTH_TOKEN=<any-secret>
   export GOOGLE_API_KEY=<your-key>          # or ANTHROPIC/OPENAI/GROQ
   ```

   Both sides read the same `GRALKOR_AUTH_TOKEN` — Gralkor enforces it on incoming requests, Susu2 attaches it as `Authorization: Bearer <token>`.

4. **Wire the plugin + actions on your agent:**

   ```elixir
   # lib/susu2/chat_agent.ex
   use Jido.Agent,
     name: "susu2_chat",
     plugins: Jido.AI.PluginStack.default_plugins() ++ [Susu2.Gralkor.Plugin],
     strategy:
       {Jido.AI.Reasoning.ReAct.Strategy,
        tools: [Susu2.Gralkor.Actions.MemorySearch, Susu2.Gralkor.Actions.MemoryAdd]}
   ```

   Susu2.Gralkor.Plugin hooks `ai.react.query` (auto-recall) and `ai.request.completed` / `ai.request.failed` (auto-capture). The plugin and actions both use `Susu2.Gralkor.Client` — swap the impl to `Susu2.Gralkor.Client.InMemory` in test config, keep `Susu2.Gralkor.Client.HTTP` for dev/prod.

5. **Verify boot.** `iex -S mix` → `curl -H 'Authorization: Bearer <token>' http://127.0.0.1:4000/health` → `{"status":"ok",…}`. Send a message through the bot; watch for `POST /recall` then (after the capture idle window) `[gralkor] episode added …` in the logs.

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
