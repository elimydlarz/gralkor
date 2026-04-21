import type { GralkorClient, Message, Result } from "../client.js";

export interface GralkorHttpClientOptions {
  /** Base URL of the Gralkor server (e.g. `http://127.0.0.1:4000`). No trailing slash required. */
  baseUrl: string;
  /** Override fetch, e.g. for tests. Defaults to global fetch. */
  fetch?: typeof fetch;
}

/**
 * HTTP adapter for {@link GralkorClient}.
 *
 * No auth: the server binds to loopback and expects its consumer to supervise it.
 * Retries are disabled (matches the Elixir adapter's `retry: false`) — every
 * failure surfaces immediately so the caller can decide how to fail open.
 *
 * Per-endpoint timeouts (milliseconds), calibrated to the workload:
 *
 *   - `/health`                — 2 000
 *   - `/recall`                — 5 000
 *   - `/capture`               — 5 000
 *   - `/session_end`           — 5 000
 *   - `/tools/memory_search`   — 10 000
 *   - `/tools/memory_add`      — 60 000 (Graphiti extraction is slow)
 *
 * Blank session ids throw `Error` — Gralkor requires a non-blank session_id.
 */
export class GralkorHttpClient implements GralkorClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GralkorHttpClientOptions) {
    if (!options.baseUrl) throw new Error("baseUrl is required");
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? fetch;
  }

  async recall(
    groupId: string,
    sessionId: string,
    query: string,
  ): Promise<Result<string | null>> {
    requireSessionId(sessionId);
    const res = await this.post("/recall", { group_id: groupId, session_id: sessionId, query }, 5_000);
    if ("error" in res) return res;
    const body = res.ok as { memory_block?: string };
    if (body.memory_block === undefined) return { error: { kind: "unexpected_body", body } };
    if (body.memory_block === "") return { ok: null };
    return { ok: body.memory_block };
  }

  async capture(sessionId: string, groupId: string, messages: Message[]): Promise<Result<true>> {
    requireSessionId(sessionId);
    const res = await this.post(
      "/capture",
      { session_id: sessionId, group_id: groupId, messages },
      5_000,
    );
    return "error" in res ? res : { ok: true };
  }

  async endSession(sessionId: string): Promise<Result<true>> {
    requireSessionId(sessionId);
    const res = await this.post("/session_end", { session_id: sessionId }, 5_000);
    return "error" in res ? res : { ok: true };
  }

  async memorySearch(
    groupId: string,
    sessionId: string,
    query: string,
  ): Promise<Result<string>> {
    requireSessionId(sessionId);
    const res = await this.post(
      "/tools/memory_search",
      { group_id: groupId, session_id: sessionId, query },
      10_000,
    );
    if ("error" in res) return res;
    const body = res.ok as { text?: string };
    if (body.text === undefined) return { error: { kind: "unexpected_body", body } };
    return { ok: body.text };
  }

  async memoryAdd(
    groupId: string,
    content: string,
    sourceDescription: string | null,
  ): Promise<Result<true>> {
    const body: Record<string, unknown> = { group_id: groupId, content };
    if (sourceDescription !== null) body.source_description = sourceDescription;
    const res = await this.post("/tools/memory_add", body, 60_000);
    return "error" in res ? res : { ok: true };
  }

  async healthCheck(): Promise<Result<true>> {
    const res = await this.request("GET", "/health", undefined, 2_000);
    return "error" in res ? res : { ok: true };
  }

  async buildIndices(): Promise<Result<{ status: string }>> {
    const res = await this.post("/build-indices", {}, 60_000);
    if ("error" in res) return res;
    const body = res.ok as { status?: string };
    if (typeof body.status !== "string") return { error: { kind: "unexpected_body", body } };
    return { ok: { status: body.status } };
  }

  async buildCommunities(
    groupId: string,
  ): Promise<Result<{ communities: number; edges: number }>> {
    const res = await this.post(
      "/build-communities",
      { group_id: groupId },
      120_000,
    );
    if ("error" in res) return res;
    const body = res.ok as { communities?: number; edges?: number };
    if (typeof body.communities !== "number" || typeof body.edges !== "number") {
      return { error: { kind: "unexpected_body", body } };
    }
    return { ok: { communities: body.communities, edges: body.edges } };
  }

  private post(path: string, body: unknown, timeoutMs: number): Promise<Result<unknown>> {
    return this.request("POST", path, body, timeoutMs);
  }

  private async request(
    method: "GET" | "POST",
    path: string,
    body: unknown | undefined,
    timeoutMs: number,
  ): Promise<Result<unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: body !== undefined ? { "content-type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (res.status >= 200 && res.status < 300) {
        const text = await res.text();
        if (text === "") return { ok: null };
        try {
          return { ok: JSON.parse(text) };
        } catch {
          return { ok: text };
        }
      }

      const errBody = await res.text().catch(() => "");
      return { error: { kind: "http_status", status: res.status, body: errBody } };
    } catch (err) {
      return {
        error: {
          kind: "network",
          cause: err instanceof Error ? err.message : String(err),
        },
      };
    } finally {
      clearTimeout(timer);
    }
  }
}

function requireSessionId(id: string): void {
  if (typeof id !== "string" || id === "") {
    throw new Error("session_id must be a non-blank string");
  }
}
