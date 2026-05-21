# Changelog

## [3.1.0] - 2026-05-21

### Added
- `:gralkor_ex, :interpret_max_output_tokens` app env (positive integer). When set, `Gralkor.Client.Native.recall/4` forwards it as `:output_token_budget` to the interpret pipeline on every recall. When unset, the pipeline applies its 2000-token default. Raise this for wide-recall workloads where the default truncates and surfaces as `Gralkor.InterpretParseFailed`.
- `Gralkor.InterpretParseFailed` exception. Raised by `Gralkor.Interpret.interpret_facts/5` when the LLM response cannot be parsed against the structured-output schema (truncation or schema mismatch). Distinct from `RuntimeError` so callers can catch parse failure specifically.

### Changed
- `Gralkor.Interpret.interpret_facts/5` now accepts `opts[:output_token_budget]` (default 2000, validated positive integer). The interpretation prompt carries a `"Respond within {N} tokens"` instruction so the model self-limits the breadth of its answer.
- The `interpret_fn` callback type is now `(prompt, max_tokens) -> ...` (arity 2) so the LLM wiring can set `max_tokens` on the provider call. This is internal — the public `Gralkor.Client` port is unchanged — but any external code constructing its own `interpret_fn` closure to pass into `Gralkor.Recall.recall/5` will need to widen by one argument.
- A malformed LLM response (non-dict, missing `relevantFacts`, or non-list `relevantFacts`) now raises `Gralkor.InterpretParseFailed` rather than `RuntimeError`. Upstream-LLM errors (`{:error, _}` from the callback) still raise `RuntimeError`.
- **BREAKING (internal shape).** `Gralkor.Config.llm_model/0` and `Gralkor.Config.embedder_model/0` now return `%{provider: atom(), id: String.t()}` maps instead of `"provider:model"` strings. This is the inline-map shape `ReqLLM.model/1` accepts directly — without the LLMDB catalog lookup that was emitting `IO.warn: "Using unverified model: google:gemini-3.1-flash-lite"` on every fresh model resolution (warmup, test boot, CI run). The `GRALKOR_LLM_MODEL` / `GRALKOR_EMBEDDER_MODEL` operator contract is unchanged (still `"provider:model"`); only the internal return shape flipped. Malformed env values now raise `ArgumentError` naming the env var and the bad value.

## [3.0.0] - 2026-05-18

### Changed
- **BREAKING.** `Gralkor.Client.end_session/1` is removed. Use `flush/1` for the existing fire-and-forget behaviour (returns `:ok` before buffered turns have landed — appropriate for shutdown paths) or the new `flush_and_await/2` for callers that must observe completion before rotating session state (e.g. session-id rotation). Both implementations are provided by `Gralkor.Client.Native` and the in-memory twin.
- Default LLM model is now `google:gemini-3.1-flash-lite` (GA). The `-preview` suffix was removed upstream.

### Added
- `Gralkor.Client.flush_and_await/2` — `:ok` only after the episode is queryable via `recall/4`, or `{:error, :timeout}`.
