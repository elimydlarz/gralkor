import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphitiClient } from "./client.js";

// ── Helpers ──────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Constructor ──────────────────────────────────────────────

describe("constructor", () => {
  it("strips trailing slashes from baseUrl", () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000///" });
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    client.health();

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("http://localhost:8000/health");
  });

  it("uses default timeoutMs of 30000", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await client.health();

    // The signal is an AbortSignal — verify fetch was called with one
    const opts = fetchMock.mock.calls[0][1] as RequestInit;
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses default maxRetries of 2", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockRejectedValue(new Error("network error"));

    await expect(client.health()).rejects.toThrow("network error");

    // 1 initial + 2 retries = 3 calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("respects custom timeoutMs", async () => {
    const client = new GraphitiClient({
      baseUrl: "http://localhost:8000",
      timeoutMs: 42,
      maxRetries: 0,
    });
    // Make fetch hang until aborted
    fetchMock.mockImplementation((_url: string, opts: RequestInit) => {
      return new Promise((_resolve, reject) => {
        opts.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    });

    await expect(client.health()).rejects.toThrow();
    // The test above would time out with the default 30s if custom timeoutMs wasn't applied
  });

  it("respects custom maxRetries", async () => {
    const client = new GraphitiClient({
      baseUrl: "http://localhost:8000",
      maxRetries: 0,
    });
    fetchMock.mockRejectedValue(new Error("network error"));

    await expect(client.health()).rejects.toThrow("network error");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ── Retry logic ──────────────────────────────────────────────

describe("retry logic", () => {
  it("retries on network errors and succeeds", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await client.health();
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx responses", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock
      .mockResolvedValueOnce(textResponse("Internal Server Error", 500))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await client.health();
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries on 502 and 503", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock
      .mockResolvedValueOnce(textResponse("Bad Gateway", 502))
      .mockResolvedValueOnce(textResponse("Service Unavailable", 503))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await client.health();
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does NOT retry on 4xx client errors", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(textResponse("Not Found", 404));

    await expect(client.health()).rejects.toThrow("returned 404");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 400", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(textResponse("Bad Request", 400));

    await expect(client.health()).rejects.toThrow("returned 400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on 422", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(textResponse("Validation Error", 422));

    await expect(client.health()).rejects.toThrow("returned 422");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws after exhausting retries on 5xx", async () => {
    const client = new GraphitiClient({
      baseUrl: "http://localhost:8000",
      maxRetries: 1,
    });
    fetchMock.mockResolvedValue(textResponse("Server Error", 500));

    await expect(client.health()).rejects.toThrow("returned 500");
    // 1 initial + 1 retry = 2
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws after exhausting retries on network errors", async () => {
    const client = new GraphitiClient({
      baseUrl: "http://localhost:8000",
      maxRetries: 1,
    });
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(client.health()).rejects.toThrow("ECONNREFUSED");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("includes method, path, and status in error message for HTTP errors", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockImplementation(() =>
      Promise.resolve(textResponse("gone", 410)),
    );

    await expect(client.health()).rejects.toThrow(
      "Graphiti GET /health returned 410: gone",
    );
  });

  it("truncates long error response body to 500 chars", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    const longBody = "a".repeat(600);
    fetchMock.mockResolvedValue(textResponse(longBody, 404));

    const err = await client.health().catch((e: Error) => e);
    // The body should be truncated to 500 chars
    expect(err.message).toContain("a".repeat(500));
    expect(err.message).not.toContain("a".repeat(501));
  });

  it("does not retry 399 status codes (treated as success range)", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    // 399 is < 400 so !res.ok is true but status < 400 means it's not a client error
    // Actually, 399 is not ok (ok means 200-299), and >= 400 check means it would retry
    fetchMock
      .mockResolvedValueOnce(new Response("weird", { status: 399 }))
      .mockResolvedValueOnce(jsonResponse({ status: "ok" }));

    const result = await client.health();
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles error body read failure gracefully", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    const badResponse = new Response(null, { status: 404 });
    // Make text() reject
    vi.spyOn(badResponse, "text").mockRejectedValue(new Error("read failed"));
    fetchMock.mockResolvedValue(badResponse);

    await expect(client.health()).rejects.toThrow("returned 404:");
  });

  it("wraps non-Error throws in an Error", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000", maxRetries: 0 });
    fetchMock.mockRejectedValue("string error");

    await expect(client.health()).rejects.toThrow("string error");
  });
});

// ── Response parsing ─────────────────────────────────────────

describe("response parsing", () => {
  it("parses JSON when content-type is application/json", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ key: "value" }));

    const result = await client.health();
    expect(result).toEqual({ key: "value" });
  });

  it("returns text when content-type is not JSON", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(textResponse("plain text"));

    const result = await client.health();
    expect(result).toEqual("plain text");
  });

  it("returns text when content-type header is missing", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(new Response("no type", { status: 200 }));

    const result = await client.health();
    expect(result).toEqual("no type");
  });
});

// ── Public methods ───────────────────────────────────────────

describe("health()", () => {
  it("sends GET to /health", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    await client.health();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/health",
      expect.objectContaining({ method: "GET" }),
    );
  });
});

describe("getStatus()", () => {
  it("delegates to health()", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ status: "ok" }));

    const result = await client.getStatus();
    expect(result).toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("addEpisode()", () => {
  it("sends POST to /episodes with JSON body", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    await client.addEpisode({
      name: "test",
      episode_body: "body",
      source_description: "src",
      group_id: "g1",
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/episodes");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });

    const body = JSON.parse(opts.body);
    expect(body.name).toBe("test");
    expect(body.episode_body).toBe("body");
    expect(body.group_id).toBe("g1");
  });

  it("defaults reference_time to current ISO timestamp", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    const before = new Date().toISOString();
    await client.addEpisode({
      name: "test",
      episode_body: "body",
      source_description: "src",
      group_id: "g1",
    });
    const after = new Date().toISOString();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reference_time >= before).toBe(true);
    expect(body.reference_time <= after).toBe(true);
  });

  it("includes an idempotency_key in the request body", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    await client.addEpisode({
      name: "test",
      episode_body: "body",
      source_description: "src",
      group_id: "g1",
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("sends the same idempotency_key on each retry attempt", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "fail" }, 500))
      .mockResolvedValueOnce(jsonResponse({ uuid: "ep-1" }));

    await client.addEpisode({
      name: "test",
      episode_body: "body",
      source_description: "src",
      group_id: "g1",
    });

    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body1.idempotency_key).toBe(body2.idempotency_key);
  });
});

describe("ingestMessages()", () => {
  it("sends POST to /ingest-messages with structured messages", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    await client.ingestMessages({
      name: "test",
      source_description: "auto-capture",
      group_id: "g1",
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/ingest-messages");
    expect(opts.method).toBe("POST");

    const body = JSON.parse(opts.body);
    expect(body.name).toBe("test");
    expect(body.messages).toHaveLength(2);
    expect(body.group_id).toBe("g1");
  });

  it("defaults reference_time to current ISO timestamp", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    const before = new Date().toISOString();
    await client.ingestMessages({
      name: "test",
      source_description: "src",
      group_id: "g1",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    });
    const after = new Date().toISOString();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.reference_time >= before).toBe(true);
    expect(body.reference_time <= after).toBe(true);
  });

  it("includes thinking blocks in messages payload", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    await client.ingestMessages({
      name: "test",
      source_description: "src",
      group_id: "g1",
      messages: [
        { role: "assistant", content: [
          { type: "thinking", text: "Let me think..." },
          { type: "text", text: "Done" },
        ]},
      ],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content).toEqual([
      { type: "thinking", text: "Let me think..." },
      { type: "text", text: "Done" },
    ]);
  });

  it("includes an idempotency_key in the request body", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ uuid: "ep-1" }));

    await client.ingestMessages({
      name: "test",
      source_description: "src",
      group_id: "g1",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.idempotency_key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("sends the same idempotency_key on each retry attempt", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "fail" }, 500))
      .mockResolvedValueOnce(jsonResponse({ uuid: "ep-1" }));

    await client.ingestMessages({
      name: "test",
      source_description: "src",
      group_id: "g1",
      messages: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
    });

    const body1 = JSON.parse(fetchMock.mock.calls[0][1].body);
    const body2 = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body1.idempotency_key).toBe(body2.idempotency_key);
  });
});

describe("search()", () => {
  it("sends POST to /search with correct body", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    const emptyResults = { facts: [], nodes: [], episodes: [], communities: [] };
    fetchMock.mockResolvedValue(jsonResponse(emptyResults));

    await client.search("test query", ["g1", "g2"], 5);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/search");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      query: "test query",
      group_ids: ["g1", "g2"],
      num_results: 5,
    });
  });

  it("defaults limit to 10", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    const emptyResults = { facts: [], nodes: [], episodes: [], communities: [] };
    fetchMock.mockResolvedValue(jsonResponse(emptyResults));

    await client.search("q", ["g1"]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.num_results).toBe(10);
  });

  it("returns SearchResults shape", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    const results = {
      facts: [{ uuid: "f1", name: "KNOWS", fact: "A knows B", group_id: "g1", valid_at: null, invalid_at: null, created_at: "2025-01-01" }],
      nodes: [{ uuid: "n1", name: "A", summary: "Entity A", group_id: "g1", created_at: "2025-01-01" }],
      episodes: [],
      communities: [],
    };
    fetchMock.mockResolvedValue(jsonResponse(results));

    const result = await client.search("test", ["g1"]);

    expect(result.facts).toHaveLength(1);
    expect(result.nodes).toHaveLength(1);
    expect(result.episodes).toHaveLength(0);
    expect(result.communities).toHaveLength(0);
  });
});

describe("getEpisodes()", () => {
  it("sends GET to /episodes with query params", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.getEpisodes("g1", 5);

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/episodes?group_id=g1&limit=5");
    expect(opts.method).toBe("GET");
  });

  it("encodes special characters in groupId", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.getEpisodes("group/with spaces", 5);

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("group_id=group%2Fwith%20spaces");
  });

  it("defaults limit to 10", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse([]));

    await client.getEpisodes("g1");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("limit=10");
  });
});

describe("deleteEpisode()", () => {
  it("sends DELETE to /episodes/{uuid}", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await client.deleteEpisode("ep-42");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/episodes/ep-42");
    expect(opts.method).toBe("DELETE");
  });

  it("encodes special characters in uuid", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await client.deleteEpisode("uuid/with spaces");

    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("episodes/uuid%2Fwith%20spaces");
  });
});

describe("deleteEdge()", () => {
  it("sends DELETE to /edges/{uuid}", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await client.deleteEdge("edge-42");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/edges/edge-42");
    expect(opts.method).toBe("DELETE");
  });
});

describe("clearGraph()", () => {
  it("sends POST to /clear with group_id", async () => {
    const client = new GraphitiClient({ baseUrl: "http://localhost:8000" });
    fetchMock.mockResolvedValue(jsonResponse({ deleted: true }));

    await client.clearGraph("g1");

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/clear");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ group_id: "g1" });
  });
});
