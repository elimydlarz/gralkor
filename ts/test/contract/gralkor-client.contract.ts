import { describe, it, expect, beforeEach } from "vitest";
import type { GralkorClient, Message, Result } from "../../src/client.js";

/**
 * Shared port-contract assertions for `GralkorClient` implementations.
 *
 * Both adapters — `GralkorInMemoryClient` and `GralkorHttpClient` — must pass
 * this suite. Adapter-specific behaviour (HTTP status mapping, blank-session
 * throws, request shape) lives in the adapter's own test file alongside this
 * shared contract.
 *
 * Usage:
 *
 * ```ts
 * import { gralkorClientContract } from "../contract/gralkor-client.contract";
 *
 * gralkorClientContract({
 *   make: () => new GralkorInMemoryClient(),
 *   configureBackend: (client, op, response) => { ... },
 * });
 * ```
 */
export interface ContractSetup {
  make: () => GralkorClient;
  configureBackend: (
    client: GralkorClient,
    op:
      | "recall"
      | "capture"
      | "endSession"
      | "memorySearch"
      | "memoryAdd"
      | "healthCheck"
      | "buildIndices"
      | "buildCommunities",
    response: Result<unknown>,
  ) => void | Promise<void>;
}

export function gralkorClientContract(setup: ContractSetup): void {
  let client: GralkorClient;

  beforeEach(() => {
    client = setup.make();
  });

  describe("port contract: recall with a non-blank string session_id", () => {
    it("returns { ok: block } when the backend has memory", async () => {
      await setup.configureBackend(client, "recall", { ok: "<gralkor-memory>facts</gralkor-memory>" });
      const r = await client.recall("g1", "s1", "q");
      expect(r).toEqual({ ok: "<gralkor-memory>facts</gralkor-memory>" });
    });

    it("returns { ok: null } when the backend has no memory", async () => {
      await setup.configureBackend(client, "recall", { ok: null });
      const r = await client.recall("g1", "s1", "q");
      expect(r).toEqual({ ok: null });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "recall", { error: "boom" });
      const r = await client.recall("g1", "s1", "q");
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: recall with a null session_id", () => {
    it("returns { ok: block } when the backend has memory", async () => {
      await setup.configureBackend(client, "recall", { ok: "<gralkor-memory>facts</gralkor-memory>" });
      const r = await client.recall("g1", null, "q");
      expect(r).toEqual({ ok: "<gralkor-memory>facts</gralkor-memory>" });
    });

    it("returns { ok: null } when the backend has no memory", async () => {
      await setup.configureBackend(client, "recall", { ok: null });
      const r = await client.recall("g1", null, "q");
      expect(r).toEqual({ ok: null });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "recall", { error: "boom" });
      const r = await client.recall("g1", null, "q");
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: capture", () => {
    const messages: Message[] = [
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
    ];

    it("returns { ok: true } when the backend acknowledges the capture", async () => {
      await setup.configureBackend(client, "capture", { ok: true });
      const r = await client.capture("s1", "g1", messages);
      expect(r).toEqual({ ok: true });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "capture", { error: "boom" });
      const r = await client.capture("s1", "g1", messages);
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: endSession", () => {
    it("returns { ok: true } when the backend acknowledges the end", async () => {
      await setup.configureBackend(client, "endSession", { ok: true });
      const r = await client.endSession("s1");
      expect(r).toEqual({ ok: true });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "endSession", { error: "boom" });
      const r = await client.endSession("s1");
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: memorySearch", () => {
    it("returns { ok: text } when the backend returns results", async () => {
      await setup.configureBackend(client, "memorySearch", { ok: "Facts:\n- ..." });
      const r = await client.memorySearch("g1", "s1", "q");
      expect(r).toEqual({ ok: "Facts:\n- ..." });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "memorySearch", { error: "boom" });
      const r = await client.memorySearch("g1", "s1", "q");
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: memoryAdd", () => {
    it("returns { ok: true } when the backend acknowledges the add", async () => {
      await setup.configureBackend(client, "memoryAdd", { ok: true });
      const r = await client.memoryAdd("g1", "content", "source");
      expect(r).toEqual({ ok: true });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "memoryAdd", { error: "boom" });
      const r = await client.memoryAdd("g1", "content", null);
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: healthCheck", () => {
    it("returns { ok: true } when the backend is healthy", async () => {
      await setup.configureBackend(client, "healthCheck", { ok: true });
      const r = await client.healthCheck();
      expect(r).toEqual({ ok: true });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "healthCheck", { error: "boom" });
      const r = await client.healthCheck();
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: buildIndices", () => {
    it("returns { ok: { status } } when the backend acknowledges", async () => {
      await setup.configureBackend(client, "buildIndices", {
        ok: { status: "stored" },
      });
      const r = await client.buildIndices();
      expect(r).toEqual({ ok: { status: "stored" } });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "buildIndices", { error: "boom" });
      const r = await client.buildIndices();
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: buildCommunities", () => {
    it("returns { ok: { communities, edges } } when the backend returns counts", async () => {
      await setup.configureBackend(client, "buildCommunities", {
        ok: { communities: 3, edges: 17 },
      });
      const r = await client.buildCommunities("g1");
      expect(r).toEqual({ ok: { communities: 3, edges: 17 } });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "buildCommunities", { error: "boom" });
      const r = await client.buildCommunities("g1");
      expect("error" in r).toBe(true);
    });
  });
}
