# Changelog

## [2.1.0] - 2026-05-21

### Added
- `GralkorHttpClient` constructor option `interpretMaxOutputTokens?: number` (positive integer). When set, every `/recall` request body includes `interpret_max_output_tokens`, which the server passes to its interpret pipeline as `max_tokens`. When unset, the server applies its 2000-token default. Raise this for wide-recall workloads where the default truncates and surfaces as `InterpretParseFailed` server-side. Non-positive or non-integer values throw at construction.
- Python server: `POST /recall` accepts an optional `interpret_max_output_tokens` body field (positive integer). When set, forwards to `interpret_facts(...)` as `output_token_budget`. When unset, the pipeline applies its 2000-token default.
- Python server: `pipelines.interpret.InterpretParseFailed` exception. Raised by `interpret_facts(...)` when the LLM response cannot be parsed against the `InterpretResult` schema. Distinct from `RuntimeError` so callers can catch parse failure specifically. The legacy silent passthrough of truncated entries is removed.

### Changed
- Python server: `interpret_facts(...)` now accepts `output_token_budget: int = 2000` (validated positive). The `max_tokens` value passed to the LLM client is the budget — replacing the legacy hardcoded `max_tokens=500` that produced truncated JSON under wide-recall workloads. The interpretation prompt carries a `"Respond within {N} tokens"` instruction so the model self-limits.

## [2.0.0] - 2026-05-18

### Changed
- **BREAKING.** `ServerManagerOptions.wheelRepo` is now a required field. The previous hard-coded `WHEEL_REPO = "elimydlarz/gralkor"` is removed — the consumer publishes the arm64 wheel, so the consumer must tell us where it published it. Consumers should derive the slug from their own `package.json` `repository.url` and pass it through.
- Default LLM model is now `gemini-3.1-flash-lite` (GA). The `-preview` suffix was removed upstream.

### Added
- `wheelDownloadUrl(wheelRepo, version)` exported helper — same URL the server manager resolves on linux/arm64, exposed so consumers can pre-warm or surface it.
- `createServerManager(...).start()` is now idempotent. Concurrent callers (e.g. multiple OpenClaw hooks racing on first request) share a single boot promise instead of double-spawning.
