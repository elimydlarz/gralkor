import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { GralkorHttpClient } from "../../src/client/http.js";
import { gralkorClientContract } from "../contract/gralkor-client.contract.js";
import type { Result } from "../../src/client.js";

type StubKey =
  | "recall"
  | "capture"
  | "endSession"
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
        key === "recall" ? { memory_block: response.ok } :
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
      harness.stub("recall", { ok: "<gralkor-memory>x</gralkor-memory>" });
      await harness.client.recall("g1", "s1", "q", "TestAgent");
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
      const r = await client.recall("g1", "s1", "q", "TestAgent");
      expect("error" in r).toBe(true);
      if ("error" in r) {
        expect((r.error as { kind: string }).kind).toBe("http_status");
      }
    });
  });

  describe("if capture is called with a blank string session_id", () => {
    it("the call throws", async () => {
      const messages = [{ role: "user" as const, content: "q" }];
      await expect(harness.client.capture("", "g1", "TestAgent", messages)).rejects.toThrow(/session_id/);
    });
  });

  describe("if capture is called with a null session_id", () => {
    it("the call throws", async () => {
      const messages = [{ role: "user" as const, content: "q" }];
      await expect(
        harness.client.capture(null as unknown as string, "g1", "TestAgent", messages),
      ).rejects.toThrow(/session_id/);
    });
  });

  describe("if endSession is called with a blank string session_id", () => {
    it("the call throws", async () => {
      await expect(harness.client.endSession("")).rejects.toThrow(/session_id/);
    });
  });

  describe("if endSession is called with a null session_id", () => {
    it("the call throws", async () => {
      await expect(
        harness.client.endSession(null as unknown as string),
      ).rejects.toThrow(/session_id/);
    });
  });

  describe("when recall is called with a non-blank string session_id", () => {
    it("the session_id field is included in the HTTP body", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async (_url, init) => {
          capturedBody = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ memory_block: "<gralkor-memory>x</gralkor-memory>" }), { status: 200 });
        },
      });
      await client.recall("g1", "s1", "q", "TestAgent");
      expect(capturedBody?.session_id).toBe("s1");
    });
  });

  describe("when recall is called with a null session_id", () => {
    it("the session_id field is omitted from the HTTP body", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async (_url, init) => {
          capturedBody = JSON.parse(init?.body as string);
          return new Response(JSON.stringify({ memory_block: "<gralkor-memory>x</gralkor-memory>" }), { status: 200 });
        },
      });
      await client.recall("g1", null, "q", "TestAgent");
      expect(capturedBody).not.toHaveProperty("session_id");
    });
  });

  describe("if the server returns any non-2xx HTTP response", () => {
    it("the response surfaces as {:error, {:http_status, status, body}}", async () => {
      let calls = 0;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async () => {
          calls += 1;
          return new Response(JSON.stringify({ detail: "rate limited" }), {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": "0" },
          });
        },
      });
      const result = await client.recall("g1", "s1", "q", "TestAgent");
      expect("error" in result).toBe(true);
      if ("error" in result) {
        expect((result.error as { kind: string; status: number }).kind).toBe("http_status");
        expect((result.error as { kind: string; status: number }).status).toBe(429);
      }
      expect(calls).toBe(1);
    });
  });

  describe("if the transport fails with any error (including :closed, :timeout, :econnreset)", () => {
    it("the failure surfaces immediately", async () => {
      for (const code of ["ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET", "ENOTFOUND"]) {
        let calls = 0;
        const client = new GralkorHttpClient({
          baseUrl: "http://gralkor.test",
          fetch: async () => {
            calls += 1;
            const err = new Error(`transport failure: ${code}`) as Error & { code?: string };
            err.code = code;
            throw err;
          },
        });
        const result = await client.recall("g1", "s1", "q", "TestAgent");
        expect("error" in result).toBe(true);
        if ("error" in result) {
          expect((result.error as { kind: string }).kind).toBe("network");
        }
        expect(calls).toBe(1);
      }
    });
  });

  describe("when recall is called without maxResults", () => {
    it("omits max_results from the request body so the server applies its default", async () => {
      harness.stub("recall", { ok: "<gralkor-memory>x</gralkor-memory>" });
      await harness.client.recall("g1", "s1", "q", "TestAgent");
      const body = JSON.parse(String(harness.lastRequest()?.init.body));
      expect(body).toEqual({ group_id: "g1", session_id: "s1", query: "q", agent_name: "TestAgent" });
    });
  });

  describe("when recall is called with maxResults", () => {
    it("includes max_results in the request body", async () => {
      harness.stub("recall", { ok: "<gralkor-memory>x</gralkor-memory>" });
      await harness.client.recall("g1", "s1", "q", "TestAgent", 5);
      const body = JSON.parse(String(harness.lastRequest()?.init.body));
      expect(body).toEqual({ group_id: "g1", session_id: "s1", query: "q", agent_name: "TestAgent", max_results: 5 });
    });
  });

  describe("when capture is called", () => {
    it("includes agent_name in the HTTP body", async () => {
      let capturedBody: Record<string, unknown> | undefined;
      const client = new GralkorHttpClient({
        baseUrl: "http://gralkor.test",
        fetch: async (_url, init) => {
          capturedBody = JSON.parse(init?.body as string);
          return new Response(null, { status: 204 });
        },
      });
      await client.capture("s1", "g1", "TestAgent", [{ role: "user", content: "q" }]);
      expect(capturedBody?.agent_name).toBe("TestAgent");
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
    { path: "/recall", ms: 12_000, call: (c) => c.recall("g", "s", "q", "TestAgent") },
    {
      path: "/capture",
      ms: 5_000,
      call: (c) => c.capture("s", "g", "TestAgent", [{ role: "user", content: "q" }]),
    },
    { path: "/session_end", ms: 5_000, call: (c) => c.endSession("s") },
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
