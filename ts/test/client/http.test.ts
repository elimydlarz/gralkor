import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GralkorHttpClient } from "../../src/client/http.js";
import { gralkorClientContract } from "../contract/gralkor-client.contract.js";
import type { Result } from "../../src/client.js";

type StubKey =
  | "recall"
  | "capture"
  | "endSession"
  | "memorySearch"
  | "memoryAdd"
  | "healthCheck"
  | "buildIndices"
  | "buildCommunities";

type Stub = {
  status: number;
  body: unknown;
};

function makeStubbedClient(): {
  client: GralkorHttpClient;
  stub: (key: StubKey, response: Result<unknown>) => void;
  lastRequest: () => { url: string; init: RequestInit } | null;
} {
  const stubs = new Map<StubKey, Stub>();
  let last: { url: string; init: RequestInit } | null = null;

  const fetchStub: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    last = { url, init: init ?? {} };

    // route based on path
    const path = new URL(url).pathname;
    const key: StubKey | null =
      path === "/recall" ? "recall" :
      path === "/capture" ? "capture" :
      path === "/session_end" ? "endSession" :
      path === "/tools/memory_search" ? "memorySearch" :
      path === "/tools/memory_add" ? "memoryAdd" :
      path === "/health" ? "healthCheck" :
      path === "/build-indices" ? "buildIndices" :
      path === "/build-communities" ? "buildCommunities" :
      null;

    if (!key) throw new Error(`no stub for path ${path}`);

    const s = stubs.get(key);
    if (!s) throw new Error(`no stub configured for ${key}`);

    return new Response(s.body === undefined ? null : JSON.stringify(s.body), {
      status: s.status,
      headers: { "content-type": "application/json" },
    });
  };

  const client = new GralkorHttpClient({ baseUrl: "http://gralkor.test", fetch: fetchStub });

  const stub = (key: StubKey, response: Result<unknown>) => {
    if ("ok" in response) {
      // Translate Result<T> → HTTP 2xx with body the HTTP adapter will decode back to { ok: T }
      const body: Record<string, unknown> =
        key === "recall" ? { memory_block: response.ok === null ? "" : response.ok } :
        key === "memorySearch" ? { text: response.ok } :
        key === "memoryAdd" ? { status: "stored" } :
        key === "buildIndices" ? (response.ok as Record<string, unknown>) :
        key === "buildCommunities" ? (response.ok as Record<string, unknown>) :
        {};
      stubs.set(key, {
        status: key === "capture" || key === "endSession" ? 204 : 200,
        body: key === "capture" || key === "endSession" ? undefined : body,
      });
    } else {
      stubs.set(key, { status: 503, body: response.error });
    }
  };

  return { client, stub, lastRequest: () => last };
}

describe("GralkorHttpClient (via shared contract)", () => {
  const ctx = { current: makeStubbedClient() };
  beforeEach(() => {
    ctx.current = makeStubbedClient();
  });

  gralkorClientContract({
    make: () => ctx.current.client,
    configureBackend: (_c, op, response) => ctx.current.stub(op, response),
  });
});

describe("GralkorHttpClient (adapter-specific)", () => {
  let harness: ReturnType<typeof makeStubbedClient>;

  beforeEach(() => {
    harness = makeStubbedClient();
  });

  describe("every HTTP request", () => {
    it("carries no Authorization header", async () => {
      harness.stub("recall", { ok: null });
      await harness.client.recall("g1", "s1", "q");
      const headers = new Headers(harness.lastRequest()?.init.headers);
      expect(headers.has("authorization")).toBe(false);
    });
  });

  describe("if Gralkor responds with a non-2xx status", () => {
    it("returns { error: { kind: 'http_status', ... } }", async () => {
      // Direct override — the stub() helper maps { error } to 503. We want an arbitrary non-2xx.
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => new Response("i'm a teapot", { status: 418 }),
      });
      const r = await client.recall("g1", "s1", "q");
      expect("error" in r).toBe(true);
      if ("error" in r) {
        expect((r.error as { kind: string }).kind).toBe("http_status");
      }
    });
  });

  describe("if session_id is blank", () => {
    it("recall/3 throws", async () => {
      await expect(harness.client.recall("g1", "", "q")).rejects.toThrow(/session_id/);
    });
    it("capture/3 throws", async () => {
      const messages = [{ role: "user" as const, content: "q" }];
      await expect(harness.client.capture("", "g1", messages)).rejects.toThrow(/session_id/);
    });
    it("memorySearch/3 throws", async () => {
      await expect(harness.client.memorySearch("g1", "", "q")).rejects.toThrow(/session_id/);
    });
    it("endSession/1 throws", async () => {
      await expect(harness.client.endSession("")).rejects.toThrow(/session_id/);
    });
  });

  describe("retry behaviour", () => {
    it("does not retry on failure (first error surfaces immediately)", async () => {
      let calls = 0;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => {
          calls += 1;
          return new Response("", { status: 503 });
        },
      });
      await client.recall("g1", "s1", "q");
      expect(calls).toBe(1);
    });
  });
});
