# gralkor_ex

OTP supervisor + HTTP client for [Gralkor](https://github.com/elimydlarz/gralkor) — a temporally-aware knowledge-graph memory service (Graphiti + FalkorDB) wrapped as a Python/FastAPI server.

> **Renamed from `:gralkor`.** The Hex package was renamed `:gralkor → :gralkor_ex` at v1.3.0 so the published packages on either side carry matching `gralkor_ex` / `@susu-eng/gralkor-ts` names — both are adapters with their language suffix, and both depend on the shared `gralkor/server/` Python core. Version streams are independent (this Hex package is at 2.0.0; the npm package is at 1.0.0). Old `:gralkor` is retired on Hex with a pointer here. Update: `{:gralkor_ex, "~> 2.0"}`; module names (`Gralkor.Client`, `Gralkor.Server`, etc.) are unchanged.

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
    {:gralkor_ex, "~> 2.0"}
  ]
end
```

Using Gralkor from a **Jido agent**? Install [`:jido_gralkor`](https://hex.pm/packages/jido_gralkor) instead — it pulls `:gralkor_ex` transitively and ships the Jido-shaped glue (a plugin + two ReAct tools) so you don't wire the HTTP client by hand. `:jido_gralkor`'s README is the Jido-dev entry point.

## Elixir API surface

The package ships:

- **`Gralkor.Server`** (supervised by `:gralkor_ex`'s own application) — manages the Python child: spawns `uv run uvicorn main:app` via a Port, health-polls `/health` during boot, monitors at 60s intervals, and sends `SIGTERM` → `SIGKILL` on shutdown.
- **`Gralkor.Config`** — struct built from env vars (`Gralkor.Config.from_env/0`); writes `config.yaml` for the Python child.
- **`Gralkor.Client`** — behaviour defining `recall/3`, `capture/3`, `memory_search/3`, `memory_add/3`, `end_session/1`, `health_check/0`, `build_indices/0`, `build_communities/1`. Includes `sanitize_group_id/1` (hyphens → underscores; RediSearch constraint) and `impl/0` which resolves the configured adapter from `Application.get_env(:gralkor_ex, :client)` (defaults to `Gralkor.Client.HTTP`).
- **`Gralkor.Client.HTTP`** — Req-based adapter. Reads `:gralkor_ex, :client_http` (keys: `:url` required, `:plug` optional `Req.Test` plug for stubbing). No auth. No retries at this layer (`retry: false`) — non-2xx responses and transport errors surface immediately (the google-genai SDK at the server owns Vertex-upstream retries). Per-endpoint `receive_timeout`s calibrated to workload (2s `/health`, 12s `/recall` — server enforces a 10s deadline with +2s transport margin, 5s `/capture`/`/session_end`, 30s `/tools/memory_search`, 60s `/tools/memory_add`). Normalises Elixir tuples to lists before Jason encodes (so `{:ok, _}` tool results in capture event traces don't crash).
- **`Gralkor.Client.InMemory`** — test-only GenServer twin that satisfies the full `Gralkor.Client` port contract. Real behaviour (records calls, returns canned responses) rather than a mock. Shipped in `lib/` so consumers can use it in their own test suites — `start_link/0` in `test_helper.exs`, swap via `config :gralkor_ex, client: Gralkor.Client.InMemory` in `config/test.exs`. Call `reset/0` in `setup`.
- **`Gralkor.Connection`** — boot-readiness GenServer. `init/1` synchronously polls `Client.health_check/0` until healthy or the boot window expires; stops with `{:gralkor_unreachable, reason}` on timeout so your supervisor decides. After boot the process sits idle — runtime outages surface via fail-fast on the next call.
- **`Gralkor.OrphanReaper`** — pre-OTP cleanup. `reap/0` shells `lsof` for port 4000; if a process whose command line contains `gralkor_ex/priv/server` (the packaged server path under `:code.priv_dir(:gralkor_ex)`) holds it (leftover uvicorn from a crashed BEAM), SIGKILLs it; if anything else holds it, raises. Intended to run from your `mix start` entrypoint before `Mix.Task.run("app.start")` — must precede `Gralkor.Server`'s own port-free check, which refuses to clean up foreign holders.

## Install into a non-Jido consumer

1. Add `{:gralkor_ex, "~> 2.0"}` to your deps.

2. **Do not supervise `Gralkor.Server` yourself.** The `:gralkor_ex` application already does when `GRALKOR_DATA_DIR` is set. Double-supervising raises `already started`.

3. **Gate your startup on Gralkor's readiness.** Add `Gralkor.Connection` to your own supervision tree — it blocks boot until `/health` returns 200:

   ```elixir
   children = [
     Gralkor.Connection,
     # ... your app's children
   ]
   ```

4. **Wire the HTTP client config.** In `Application.start/2`:

   ```elixir
   url = System.get_env("GRALKOR_URL", "http://127.0.0.1:4000")
   Application.put_env(:gralkor_ex, :client_http, url: url)
   ```

5. **Call the client.** From anywhere in your app:

   ```elixir
   Gralkor.Client.impl().memory_add(group_id, "stored insight", "source-desc")
   Gralkor.Client.impl().memory_search(group_id, session_id, "query")
   ```

6. **(Optional) Abort-recovery for `mix start`.** If you use `mix start` as your dev entrypoint and Ctrl+C → abort sometimes leaves uvicorn orphaned on port 4000:

   ```elixir
   defmodule Mix.Tasks.Start do
     use Mix.Task
     def run(_args) do
       Gralkor.OrphanReaper.reap()
       Mix.Task.run("app.start")
       Process.flag(:trap_exit, true)
       receive do: (_ -> :ok)
     end
   end
   ```

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
- `GRALKOR_TEST` — set to `true` / `1` / `yes` to emit `test: true` in the generated `config.yaml`. The Python server flips its logger to DEBUG and prints full recall / interpret / capture payloads (off by default — normal mode is metadata-only).

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
- `handle_continue(:boot, …)` writes `config.yaml`, pre-flights the bind port (stops with `{:boot_failed, :port_in_use}` if already bound), spawns `uv run uvicorn main:app`, health-polls at 500ms until 200 or a configurable boot timeout, then schedules a 60s monitor.
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
