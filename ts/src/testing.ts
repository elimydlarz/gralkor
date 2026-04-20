/**
 * Test helpers for `@susu-eng/gralkor-ts`.
 *
 * Import from "@susu-eng/gralkor-ts/testing" in test files only. Keeps the
 * production bundle free of the in-memory twin (it's ~100 lines; small, but
 * keeping the separation matches what the Elixir side does with
 * `Gralkor.Client.InMemory` shipped as a separately-named module).
 */

export { GralkorInMemoryClient } from "./client/in-memory.js";
