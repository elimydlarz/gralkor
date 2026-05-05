# gralkor/external

The externally-managed deployment of `gralkor/server/`. Runs the same FastAPI process consumers normally spawn as a child, but as a standalone foreground service that any consumer can point at via `EXTERNAL_GRALKOR_URL`.

Intended for local development now; same `serve.sh` is what a future GCE systemd unit will invoke.

## What ships here

| File | Role |
|---|---|
| `serve.sh` | Foreground entrypoint. Loads `.env`, sets `FALKORDB_DATA_DIR`, `cd`s to `../ts/server`, `exec uv run uvicorn main:app --host 0.0.0.0 --port $HOST_PORT`. |
| `Makefile` | Command DX: `make up`, `make health`, `make clean`, `make help`. |
| `.env.example` | Template for the env file you create as `.env`. |
| `data/` | Persistent FalkorDB graph data (gitignored). |

The Python server itself lives next door at `../ts/server/`. This directory does not duplicate it.

## First run

```sh
cp .env.example .env
# edit .env — at minimum set GOOGLE_API_KEY
make up                 # foreground; Ctrl-C to stop
```

In another terminal:

```sh
make health             # → {"status":"ok"} once boot warmup completes (~10–60s on first run)
```

The first run pulls Python deps via `uv sync` (the lock file at `../ts/server/uv.lock` pins them). Subsequent runs skip that step.

## Pointing a consumer at it

Set `EXTERNAL_GRALKOR_URL=http://localhost:4000` in the consumer's environment. Both adapters skip their local-spawn paths when it is set; the local-spawn config (`GRALKOR_DATA_DIR` for Elixir, `dataDir` in the plugin config for OpenClaw) is **ignored** in this mode — it's not consulted, so leaving it set from a prior local-spawn run causes no harm:

- **Elixir (`:gralkor_ex`)** — `Gralkor.Application` includes no children; the consumer's `Gralkor.Connection` polls `/health` against the URL configured into `:client_http`.
- **TypeScript (`@susu-eng/openclaw-gralkor`)** — `register()` skips `createServerManager` and points `GralkorHttpClient` at `EXTERNAL_GRALKOR_URL`.

## Background runs

Out of scope for `external/`. Locally, use `tmux new -s gralkor 'make up'` (or `screen`, or your favourite). On a deployed VM, write a systemd unit whose `ExecStart` is the absolute path to `serve.sh` — no need for `make`. `serve.sh` is intentionally invocable directly.

## No auth

The server binds `0.0.0.0` with no authentication on any endpoint. Safe only on loopback or a trusted local network. **Do not expose this to the public internet without fronting it with an auth layer** (IAP, Cloud Endpoints, an auth proxy, etc.).

## Tests

`external/` is a fixture for tests that live next to the consumer they exercise — the adapter's thin-client mode is verified end-to-end by `external-thin-client-journey` (Elixir-driven, in `gralkor/ex/test/functional/`), which boots `serve.sh` as a fixture and runs a recall+capture round-trip with `EXTERNAL_GRALKOR_URL` set. There is no separate test framework in this directory.

## Stopping cleanly

Ctrl-C in the `make up` terminal sends SIGINT; uvicorn's `--timeout-graceful-shutdown 30` runs the FastAPI lifespan teardown — capture buffer flush, then graph driver close — before exit. Stopping mid-flush risks losing in-flight episodes; let the shutdown run.

## Lift to GCP (sketch)

Smallest viable shape, when we get there:

1. GCE VM (e2-small, Container-Optimized OS or Ubuntu).
2. cloud-init installs `uv`, clones the repo (or pulls a release tarball), writes a systemd unit whose `ExecStart` is `/path/to/gralkor/external/serve.sh`.
3. Persistent disk attached and mounted at `/var/lib/gralkor` (or wherever); set `FALKORDB_DATA_DIR` to it in `external/.env`.
4. VPC firewall: only the consumer subnet (and an authn fronting layer) can reach port 4000. Public ingress goes through IAP / Cloud Endpoints / a small auth proxy.
5. Gemini quota: same `GOOGLE_API_KEY` mechanism, set via Secret Manager → systemd `EnvironmentFile=`.

The `FALKORDB_URI` seam (so FalkorDB itself can move to FalkorDB Cloud or a separate container) is deferred — embedded `falkordblite` stays the only mode for now.
