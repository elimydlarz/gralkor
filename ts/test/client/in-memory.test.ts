import { describe, it, expect, beforeEach } from "vitest";
import { GralkorInMemoryClient } from "../../src/client/in-memory.js";
import { gralkorClientContract } from "../contract/gralkor-client.contract.js";

gralkorClientContract({
  make: () => new GralkorInMemoryClient(),
  configureBackend: (c, op, response) => {
    (c as GralkorInMemoryClient).setResponse(op, response);
  },
});

describe("GralkorInMemoryClient (twin-specific)", () => {
  let client: GralkorInMemoryClient;

  beforeEach(() => {
    client = new GralkorInMemoryClient();
  });

  describe("when an operation is called", () => {
    it("records the call with its arguments for later inspection", async () => {
      client.setResponse("recall", { ok: null });
      client.setResponse("capture", { ok: true });
      client.setResponse("memorySearch", { ok: "s" });
      client.setResponse("memoryAdd", { ok: true });
      client.setResponse("endSession", { ok: true });
      client.setResponse("healthCheck", { ok: true });
      client.setResponse("buildIndices", { ok: { status: "stored" } });
      client.setResponse("buildCommunities", { ok: { communities: 2, edges: 5 } });

      await client.recall("g1", "s1", "q");
      await client.capture("s1", "g1", { user_query: "q", assistant_answer: "a", events: [] });
      await client.memorySearch("g1", "s1", "q");
      await client.memoryAdd("g1", "content", "source");
      await client.endSession("s1");
      await client.healthCheck();
      await client.buildIndices();
      await client.buildCommunities("g1");

      expect(client.recalls).toEqual([["g1", "s1", "q"]]);
      expect(client.captures).toEqual([
        ["s1", "g1", { user_query: "q", assistant_answer: "a", events: [] }],
      ]);
      expect(client.searches).toEqual([["g1", "s1", "q"]]);
      expect(client.adds).toEqual([["g1", "content", "source"]]);
      expect(client.endSessions).toEqual([["s1"]]);
      expect(client.healthChecks).toEqual([[]]);
      expect(client.indicesBuilds).toEqual([[]]);
      expect(client.communitiesBuilds).toEqual([["g1"]]);
    });
  });

  describe("if no response is configured for an operation", () => {
    it("returns { error: 'not_configured' }", async () => {
      expect(await client.recall("g1", "s1", "q")).toEqual({ error: "not_configured" });
      expect(
        await client.capture("s1", "g1", { user_query: "q", assistant_answer: "a", events: [] }),
      ).toEqual({ error: "not_configured" });
      expect(await client.memorySearch("g1", "s1", "q")).toEqual({ error: "not_configured" });
      expect(await client.memoryAdd("g1", "c", null)).toEqual({ error: "not_configured" });
      expect(await client.endSession("s1")).toEqual({ error: "not_configured" });
      expect(await client.healthCheck()).toEqual({ error: "not_configured" });
      expect(await client.buildIndices()).toEqual({ error: "not_configured" });
      expect(await client.buildCommunities("g1")).toEqual({ error: "not_configured" });
    });
  });

  describe("when reset() is called", () => {
    it("clears configured responses and recorded calls", async () => {
      client.setResponse("recall", { ok: "block" });
      await client.recall("g1", "s1", "q");
      expect(client.recalls).toEqual([["g1", "s1", "q"]]);

      client.reset();

      expect(client.recalls).toEqual([]);
      expect(await client.recall("g1", "s1", "q")).toEqual({ error: "not_configured" });
    });
  });
});
