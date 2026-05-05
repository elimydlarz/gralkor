# Gralkor

**Persistent, temporally-aware memory for AI agents — a Graphiti + FalkorDB knowledge graph, wrapped in a small HTTP server and two adapter libraries.**

This repo is the home of the Python server and two adapter libraries. If you want memory in your agent, you most likely want a *harness* package that uses one of these adapters — see [Pick the package that fits you](#pick-the-package-that-fits-you).

## Why Gralkor

Most "agent memory" is either a pile of markdown summaries or a flat vector index. Both flatten relationships the world actually has, and neither keeps track of *when* something was true. Gralkor uses [Graphiti](https://github.com/getzep/graphiti) to build a temporal knowledge graph from agent conversations — nodes, typed edges, and `valid_at` / `invalid_at` / `expired_at` timestamps on every fact — stored in an embedded [FalkorDB](https://www.falkordb.com/).

- **Graphs beat flat stores.** [HippoRAG](https://arxiv.org/abs/2405.14831) (NeurIPS 2024): 89.1% recall@5 on 2WikiMultiHopQA for graph retrieval vs 68.2% for flat vector. [AriGraph](https://arxiv.org/abs/2407.04363) (IJCAI 2025): KG-augmented agents markedly outperform RAG, summarisation, and full-history baselines.
- **Behaviour, not just dialog.** Gralkor distils each agent turn — thoughts, tool calls, dead ends, the final answer — into a first-person behavioural summary before ingestion. Agents remember what they *did*, not just what they *said*. [Reflexion](https://arxiv.org/abs/2303.11366) (NeurIPS 2023): +11 points on HumanEval from storing reasoning traces. [ExpeL](https://arxiv.org/abs/2308.10144) (AAAI 2024): +11–19 points from storing reasoning alone.
- **Whole episodes, not isolated Q/A pairs.** The server buffers an entire session's turns, distils them together, and ingests the coherent whole. [SeCom](https://arxiv.org/abs/2502.05589) (ICLR 2025): +5.99 GPT4Score points on LOCOMO vs turn-level. [LongMemEval](https://arxiv.org/abs/2410.10813) (ICLR 2025): 0.692 → 0.615 accuracy when fact-level extraction replaces full-round episodes.
- **Temporal by default.** Graphiti resolves new info against the existing graph on every ingestion — amending, expiring, invalidating. [LongMemEval](https://arxiv.org/abs/2410.10813): temporal reasoning is the hardest memory sub-task for commercial LLMs; time-aware indexing recovers 7–11%. [MemoTime](https://arxiv.org/abs/2510.13614) (WWW 2026): temporal KGs let a 4B model match GPT-4-Turbo on temporal reasoning (+24% over static baselines).
- **Server-side interpretation.** Recall results are passed through an LLM with the in-flight conversation as context, so the agent receives *interpreted* facts rather than a raw dump to wade through.
- **Custom ontology.** Define your own entity and edge types so extraction parses text into structures you care about. [ODKE+](https://arxiv.org/abs/2509.04696) (2025): 98.8% precision for ontology-guided extraction vs 91% raw LLM. [GoLLIE](https://arxiv.org/abs/2310.03668) (ICLR 2024): +13 F1 from schema-constrained generation.

## Pick the package that fits you

This monorepo publishes three things: the Python server and two adapter libraries. Most users will pick a *harness* built on one of those adapters:

| You're building on… | Use this package | Lives at |
|---|---|---|
| **OpenClaw** agents | [`@susu-eng/openclaw-gralkor`](https://www.npmjs.com/package/@susu-eng/openclaw-gralkor) | [`elimydlarz/openclaw_gralkor`](https://github.com/elimydlarz/openclaw_gralkor) |
| **Jido** agents (Elixir) | [`:jido_gralkor` on Hex](https://hex.pm/packages/jido_gralkor) | [`elimydlarz/jido_gralkor`](https://github.com/elimydlarz/jido_gralkor) |
| Your own TS/Node app | [`@susu-eng/gralkor-ts`](https://www.npmjs.com/package/@susu-eng/gralkor-ts) + your own harness | `ts/` here |
| Your own Elixir app | [`:gralkor_ex` on Hex](https://hex.pm/packages/gralkor_ex) + your own harness | `ex/` here |

The adapters take care of spawning the Python server, gating your app's boot on it being healthy, and exposing a small port (`GralkorClient` / `Gralkor.Client`) that every consumer calls through. They also ship in-memory twins for tests.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Harness packages (other repos)                                      │
│                                                                      │
│    openclaw_gralkor → @susu-eng/gralkor-ts                           │
│    jido_gralkor    → :gralkor_ex                                     │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │   Gralkor.Client / GralkorClient
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Adapters (this repo — ex/ and ts/)                                  │
│                                                                      │
│    ts/: HTTP adapter · in-memory twin · boot-readiness gate ·        │
│         spawner. Owns the Python server at ts/server/.               │
│    ex/: in-process via Pythonx (no HTTP, no server child); pipelines │
│         reimplemented in Elixir for parity with ts/server/.          │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │   loopback HTTP (127.0.0.1:4000)
                                 │   — ts/ only —
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Python server (this repo — ts/server/)                              │
│                                                                      │
│    FastAPI / uvicorn                                                 │
│    Graphiti + embedded FalkorDB (falkordblite)                       │
│                                                                      │
│    Owns: capture buffer · turn distillation · recall interpretation  │
│          driver lock · graceful-shutdown flush                       │
└──────────────────────────────────────────────────────────────────────┘
```

The server does all the memory thinking; adapters are thin HTTP clients; harnesses wire things into their host framework's hooks and expose memory tools to the model.

## HTTP endpoints (loopback-only, unauthenticated)

| Endpoint | Purpose |
|---|---|
| `GET /health` | Boot-readiness + health monitor |
| `POST /recall` | Pre-prompt auto-recall — fast search + LLM interpretation |
| `POST /capture` | Turn capture — takes a list of canonical `{role, content}` messages (roles: `user`/`assistant`/`behaviour`); server buffers, distils, ingests on idle |
| `POST /session_end` | Flush the session's buffer now (fire-and-forget; 204 before the graph write) |
| `POST /tools/memory_add` | LLM-facing tool — store content as an episode |
| `POST /build-indices` | Admin — rebuild graph indices (whole graph) |
| `POST /build-communities` | Admin — detect entity communities (per group) |
| `POST /distill` | Standalone distillation (for consumers that want raw access) |
| `POST /search`, `POST /episodes` | Underlying Graphiti endpoints |

Auth: none. The server binds to loopback only and is spawned by the consumer's own supervision tree. If a multi-host deployment ever changes the threat model, re-add a bearer token.

## Publishing

```bash
pnpm run publish:ex -- patch|minor|major|current   # :gralkor_ex on Hex, tag gralkor-ex-v${v}
pnpm run publish:ts -- patch|minor|major|current   # @susu-eng/gralkor-ts on npm, tag gralkor-ts-v${v}
```

Each cadence is independent. The TS package owns the Python server in-tree at `ts/server/` and ships it directly in its tarball, so npm consumers get a working Python runtime without a separate download. The Elixir package has no Python server child — it embeds CPython in the BEAM via Pythonx and reimplements the server's pipelines in Elixir.

## Contributing

- Test trees (the contract) live in [TEST_TREES.md](./TEST_TREES.md).
- Server tests under `server/tests/`; Elixir tests under `ex/test/`; TS tests under `ts/test/`.
- From the repo root: `pnpm run test:unit`, `pnpm run test:int`, `pnpm run test:fun`, `pnpm run test:all`.
- Per component: `cd ex && mix test.unit|test.integration|test.functional` · `cd server && uv run pytest` · `cd ts && pnpm test`.

## Licence

MIT.
