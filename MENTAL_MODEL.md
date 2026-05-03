# Mental model

Knowledge a future agent could not recover from code and tests alone. Entries are one line; prefer tightening existing entries over adding new ones. When a section reaches its cap, displace or merge an existing entry rather than appending.

## Core Domain Identity

_(empty)_

## World-to-Code Mapping

_(empty)_

## Ubiquitous Language

_(empty)_

## Bounded Contexts

_(empty)_

## Invariants

- **Retry ownership.** The layer closest to a failure class retries it; layers above derive their timeout from that worst case; no two layers retry the same class. Distinguished classes: Vertex-upstream (429/408/5xx), client↔server transport, LLM malformed output, consumer-budget expired. Applied per chain in `RETRY_MAP.md`.
- **Vertex deadline floor.** `google-genai` SDK's `HttpOptions.timeout` serialises on the wire as a Vertex-side deadline. Gemini 3.x rejects values below 10s with `400 INVALID_ARGUMENT`. Local per-request bounds live above the SDK (e.g. `asyncio.wait_for`) — never in `HttpOptions`.
- **Single read path.** Gralkor exposes exactly one graph-read endpoint, `POST /recall`. Every harness's manual `memory_search` ReAct tool collapses onto the same path as its auto-recall hook — no parallel slower endpoint. Prevents the failure mode where manual search is 5–10× slower than auto-recall on the same group (was `/tools/memory_search`, removed in gralkor_ex 2.1 / gralkor-ts 1.1).

## Decision Rationale

- **Per-request Graphiti.** graphiti-core binds a `Graphiti` to one FalkorDB graph and mutates `self.driver` in-place on cross-group `add_episode` (graphiti.py:887). Gralkor's server instantiates a fresh `Graphiti` per request via `_graphiti_for(group_id)` rather than locking a shared instance — a lock would hide the misuse and serialise unrelated calls.

## Temporal View

_(empty)_
