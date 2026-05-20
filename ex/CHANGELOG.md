# Changelog

## [Unreleased]

### Changed
- **BREAKING (internal shape).** `Gralkor.Config.llm_model/0` and `Gralkor.Config.embedder_model/0` now return `%{provider: atom(), id: String.t()}` maps instead of `"provider:model"` strings. This is the inline-map shape `ReqLLM.model/1` accepts directly — without the LLMDB catalog lookup that was emitting `IO.warn: "Using unverified model: google:gemini-3.1-flash-lite"` on every fresh model resolution (warmup, test boot, CI run). The `GRALKOR_LLM_MODEL` / `GRALKOR_EMBEDDER_MODEL` operator contract is unchanged (still `"provider:model"`); only the internal return shape flipped. Malformed env values now raise `ArgumentError` naming the env var and the bad value.

## [3.0.0] - 2026-05-18

### Changed
- **BREAKING.** `Gralkor.Client.end_session/1` is removed. Use `flush/1` for the existing fire-and-forget behaviour (returns `:ok` before buffered turns have landed — appropriate for shutdown paths) or the new `flush_and_await/2` for callers that must observe completion before rotating session state (e.g. session-id rotation). Both implementations are provided by `Gralkor.Client.Native` and the in-memory twin.
- Default LLM model is now `google:gemini-3.1-flash-lite` (GA). The `-preview` suffix was removed upstream.

### Added
- `Gralkor.Client.flush_and_await/2` — `:ok` only after the episode is queryable via `recall/4`, or `{:error, :timeout}`.
