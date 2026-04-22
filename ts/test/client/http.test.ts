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

  describe("when the transport fails with a connection-level error, then the call is retried exactly once, when the retry succeeds", () => {
    it("the response is returned normally", async () => {
      let calls = 0;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => {
          calls += 1;
          if (calls === 1) {
            const err = new Error("connection reset") as Error & { code?: string };
            err.code = "ECONNRESET";
            throw err;
          }
          return new Response(JSON.stringify({ memory_block: "" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        },
      });
      const result = await client.recall("g1", "s1", "q");
      expect(result).toEqual({ ok: null });
      expect(calls).toBe(2);
    });
  });

  describe("when the transport fails with a connection-level error, then the call is retried exactly once, when the retry also fails", () => {
    it("the failure surfaces to the caller", async () => {
      let calls = 0;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => {
          calls += 1;
          const err = new Error("socket timeout") as Error & { code?: string };
          err.code = "ETIMEDOUT";
          throw err;
        },
      });
      const result = await client.recall("g1", "s1", "q");
      expect("error" in result).toBe(true);
      expect(calls).toBe(2);
    });
  });

  describe("when the server returns any HTTP response (including non-2xx)", () => {
    it("no retry is attempted — the response surfaces immediately", async () => {
      let calls = 0;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => {
          calls += 1;
          return new Response("", { status: 503 });
        },
      });
      const result = await client.recall("g1", "s1", "q");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect((result.error as { kind: string }).kind).toBe("http_status");
      }
      expect(calls).toBe(1);
    });
  });

  describe("if the transport fails with any other error", () => {
    it("no retry is attempted — the failure surfaces immediately (fail-fast default)", async () => {
      let calls = 0;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => {
          calls += 1;
          const err = new Error("dns lookup failed") as Error & { code?: string };
          err.code = "ENOTFOUND";
          throw err;
        },
      });
      const result = await client.recall("g1", "s1", "q");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect((result.error as { kind: string }).kind).toBe("network");
      }
      expect(calls).toBe(1);
    });
  });

  describe("when recall is called without maxResults", () => {
    it("omits max_results from the request body so the server applies its default", async () => {
      harness.stub("recall", { ok: null });
      await harness.client.recall("g1", "s1", "q");
      const body = JSON.parse(String(harness.lastRequest()?.init.body));
      expect(body).toEqual({ group_id: "g1", session_id: "s1", query: "q" });
    });
  });

  describe("when recall is called with maxResults", () => {
    it("includes max_results in the request body", async () => {
      harness.stub("recall", { ok: null });
      await harness.client.recall("g1", "s1", "q", 5);
      const body = JSON.parse(String(harness.lastRequest()?.init.body));
      expect(body).toEqual({ group_id: "g1", session_id: "s1", query: "q", max_results: 5 });
    });
  });

  describe("when memorySearch is called without max args", () => {
    it("omits both max_results and max_entity_results from the request body", async () => {
      harness.stub("memorySearch", { ok: "text" });
      await harness.client.memorySearch("g1", "s1", "q");
      const body = JSON.parse(String(harness.lastRequest()?.init.body));
      expect(body).toEqual({ group_id: "g1", session_id: "s1", query: "q" });
    });
  });

  describe("when memorySearch is called with maxResults and maxEntityResults", () => {
    it("includes both in the request body", async () => {
      harness.stub("memorySearch", { ok: "text" });
      await harness.client.memorySearch("g1", "s1", "q", 7, 3);
      const body = JSON.parse(String(harness.lastRequest()?.init.body));
      expect(body).toEqual({
        group_id: "g1",
        session_id: "s1",
        query: "q",
        max_results: 7,
        max_entity_results: 3,
      });
    });
  });
});

describe("client-timeouts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const hangingFetch: typeof fetch = (_input, init) =>
    new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) {
        reject(new DOMException("aborted", "AbortError"));
        return;
      }
      signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      );
    });

  const timed: Array<{
    path: string;
    ms: number;
    call: (c: GralkorHttpClient) => Promise<unknown>;
  }> = [
    { path: "/health", ms: 2_000, call: (c) => c.healthCheck() },
    { path: "/recall", ms: 5_000, call: (c) => c.recall("g", "s", "q") },
    {
      path: "/capture",
      ms: 5_000,
      call: (c) => c.capture("s", "g", [{ role: "user", content: "q" }]),
    },
    { path: "/session_end", ms: 5_000, call: (c) => c.endSession("s") },
    {
      path: "/tools/memory_search",
      ms: 10_000,
      call: (c) => c.memorySearch("g", "s", "q"),
    },
    {
      path: "/tools/memory_add",
      ms: 60_000,
      call: (c) => c.memoryAdd("g", "content", null),
    },
  ];

  for (const { path, ms, call } of timed) {
    it(`${path} aborts at ${ms}ms`, async () => {
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: hangingFetch,
      });
      const promise = call(client);

      await vi.advanceTimersByTimeAsync(ms + 10);
      const r = (await promise) as { error?: { kind: string } };
      expect(r.error?.kind).toBe("network");
    });
  }

  const admin: Array<{
    path: string;
    call: (c: GralkorHttpClient) => Promise<unknown>;
    body: unknown;
    expected: unknown;
  }> = [
    {
      path: "/build-indices",
      call: (c) => c.buildIndices(),
      body: { status: "ok" },
      expected: { ok: { status: "ok" } },
    },
    {
      path: "/build-communities",
      call: (c) => c.buildCommunities("g"),
      body: { communities: 3, edges: 17 },
      expected: { ok: { communities: 3, edges: 17 } },
    },
  ];

  for (const { path, call, body, expected } of admin) {
    it(`${path} has no client-side deadline`, async () => {
      let resolveFetch!: (r: Response) => void;
      const controlledFetch: typeof fetch = (_input, init) =>
        new Promise((resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException("aborted", "AbortError"));
            return;
          }
          signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
          resolveFetch = resolve;
        });

      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: controlledFetch,
      });
      const promise = call(client);

      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      await Promise.resolve();

      resolveFetch(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
      const r = await promise;
      expect(r).toEqual(expected);
    });
  }
});
