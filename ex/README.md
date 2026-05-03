# gralkor_ex

Embedded [Gralkor](https://github.com/elimydlarz/gralkor) memory for Elixir/OTP. Runs Graphiti + the embedded FalkorDB **in-process** via [Pythonx](https://github.com/livebook-dev/pythonx), and calls LLMs from Elixir via [`req_llm`](https://github.com/agentjido/req_llm). No HTTP, no Python server child, no `EXTERNAL_*_URL` mode — start the application with `GRALKOR_DATA_DIR` set and `Gralkor.Client` works.

## Prerequisites

- An LLM provider API key — `GOOGLE_API_KEY` (default) or whichever provider you've configured for `req_llm`.
- A writable directory for the embedded FalkorDB (`GRALKOR_DATA_DIR`).

The Python interpreter and all Python deps (graphiti-core + falkordblite + provider extras) are materialised into a `uv`-managed venv on first boot via Pythonx — no separate Python install, no `uv run`, no Docker.

## Install

```elixir
def deps do
  [
    {:gralkor_ex, "~> 2.2"}
  ]
end
```

Using Gralkor from a **Jido agent**? Install [`:jido_gralkor`](https://hex.pm/packages/jido_gralkor) instead — it pulls `:gralkor_ex` transitively and ships the Jido-shaped glue.

## API surface

- **`Gralkor.Client`** — the port. Behaviour with `recall/3`, `capture/3`, `end_session/1`, `memory_add/3`, `build_indices/0`, `build_communities/1`. Includes `sanitize_group_id/1` and `impl/0` (resolves the configured adapter from `Application.get_env(:gralkor_ex, :client)`; defaults to `Gralkor.Client.Native`). No `health_check/0` — the embedded runtime is ready by the time `Application.start/2` returns; runtime failures surface from the next call.
- **`Gralkor.Client.Native`** — production adapter. Wires `Gralkor.Recall` + `Gralkor.GraphitiPool` + `Gralkor.CaptureBuffer` + `req_llm`. No HTTP.
- **`Gralkor.Client.InMemory`** — test-only twin satisfying the same port contract. Records calls, returns canned responses. Swap via `config :gralkor_ex, client: Gralkor.Client.InMemory` in `config/test.exs`. Call `reset/0` in `setup`.
- **`Gralkor.Python`** — owns the PythonX runtime: SIGKILLs orphan `redislite/bin/redis-server` processes, smoke-imports `graphiti_core`. First child of the supervision tree.
- **`Gralkor.GraphitiPool`** — per-group `Graphiti` instance cache (ETS-backed for concurrent reads, GenServer for lifecycle). Owns the shared `AsyncFalkorDB`. The Python objects live here.
- **`Gralkor.CaptureBuffer`** — in-flight conversation buffer keyed by `session_id`. Holds turns until an explicit flush. Retry semantics: server-internal failures back off 1s/2s/4s; 4xx and upstream-LLM errors drop without retry.
- **`Gralkor.Recall`**, **`Gralkor.Distill`**, **`Gralkor.Interpret`**, **`Gralkor.Format`** — pure pipelines; LLM calls go through `req_llm`.
- **`Gralkor.Config`** — env-driven config struct (`from_env/0`).

## Architecture (one paragraph)

The BEAM hosts CPython via Pythonx. Graphiti's async APIs are invoked from Elixir as `Pythonx.eval` blocks wrapping `asyncio.run(...)`. The GIL is released during graphiti's awaited I/O, so concurrent Elixir callers parallelise (8 concurrent calls finish in ~1× single-call latency, not 8×). LLM calls outside of graphiti's internals (Distill's behaviour summarisation, Interpret's relevance filtering) go through `req_llm` directly from Elixir — graphiti's bundled clients only handle graphiti's own internal LLM/embedder calls during `add_episode` and `search`.

## Usage

`:gralkor_ex` starts its own supervision tree at app boot when `GRALKOR_DATA_DIR` is set. No need to add `Gralkor.GraphitiPool` or `Gralkor.CaptureBuffer` yourself.

```bash
export GRALKOR_DATA_DIR=/tmp/gralkor-dev
export GOOGLE_API_KEY=...
iex -S mix
```

```elixir
Gralkor.Client.impl().memory_add("group", "Eli prefers concise explanations", "manual")
{:ok, block} = Gralkor.Client.impl().recall("group", "session-1", "preferences?")
IO.puts(block)  # <gralkor-memory trust="untrusted">…</gralkor-memory>
```

## Env vars

Required:

- `GRALKOR_DATA_DIR` — writable directory for the embedded FalkorDB.

Optional:

- `GRALKOR_LLM_MODEL` — `req_llm` model string (e.g. `"google:gemini-2.0-flash"`). Default applied if unset.
- `GRALKOR_EMBEDDER_MODEL` — same shape; for graphiti's internal embedder.
- Provider API keys: `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GROQ_API_KEY` (whichever your providers need).

## Lifecycle

The supervision tree starts in order:

1. **`Gralkor.Python`** — synchronous boot. SIGKILLs any orphan `redislite/bin/redis-server` (BEAM grandchildren left over from a hard crash; `redislite/bin/redis-server` is unique to falkordblite, no other plausible owner). Smoke-imports `graphiti_core` so any venv / import failure surfaces at boot.
2. **`Gralkor.GraphitiPool`** — synchronous init. Constructs the shared `AsyncFalkorDB` (which spawns a `redis-server` grandchild owned by the BEAM), registers an ETS table for the per-group `Graphiti` instance cache, runs warmup.
3. **`Gralkor.CaptureBuffer`** — starts with a flush callback that distils via `req_llm` and ingests via `GraphitiPool.add_episode`.

`Application.start/2` returns only after all three have initialised — there is no separate `Gralkor.Connection` readiness gate.

## License

MIT.
