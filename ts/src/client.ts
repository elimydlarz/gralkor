/**
 * Port for talking to a Gralkor backend from TypeScript.
 *
 * Six operations — recall, capture, endSession, memorySearch, memoryAdd,
 * healthCheck. Recoverable failures surface as `{ error: reason }` so
 * callers can decide how to fail open. Unrecoverable misuse (blank
 * session id, missing base URL, etc.) throws.
 *
 * Construct the adapter you want in your composition root:
 *
 * ```ts
 * import { GralkorHttpClient } from "@susu-eng/gralkor-ts";
 * const client = new GralkorHttpClient({ baseUrl: "http://127.0.0.1:4000" });
 * ```
 *
 * In tests, swap for the in-memory twin from "@susu-eng/gralkor-ts/testing".
 */

export type Result<T, E = unknown> = { ok: T } | { error: E };

export function isOk<T, E>(r: Result<T, E>): r is { ok: T } {
  return "ok" in r;
}

export function isErr<T, E>(r: Result<T, E>): r is { error: E } {
  return "error" in r;
}

export interface Turn {
  user_query: string;
  assistant_answer: string;
  events: unknown[];
}

export interface GralkorClient {
  /** Returns the memory block for this session, or null if there is no memory. */
  recall(
    groupId: string,
    sessionId: string,
    query: string,
  ): Promise<Result<string | null>>;

  /** Buffers a turn on the server; the server flushes on idle or explicit endSession. */
  capture(
    sessionId: string,
    groupId: string,
    turn: Turn,
  ): Promise<Result<true>>;

  /** Flushes the session's buffer now; returns immediately (server handles the write async). */
  endSession(sessionId: string): Promise<Result<true>>;

  /** LLM-interpreted search result text. */
  memorySearch(
    groupId: string,
    sessionId: string,
    query: string,
  ): Promise<Result<string>>;

  /** Ingests a single piece of content; server does entity/edge extraction. */
  memoryAdd(
    groupId: string,
    content: string,
    sourceDescription: string | null,
  ): Promise<Result<true>>;

  /** Liveness probe. */
  healthCheck(): Promise<Result<true>>;
}

/**
 * Hyphens → underscores. Required because FalkorDB's RediSearch syntax
 * doesn't accept hyphens in group ids. Apply at the edge (once, when the
 * caller hands us a principal identifier).
 */
export function sanitizeGroupId(id: string): string {
  return id.replace(/-/g, "_");
}
