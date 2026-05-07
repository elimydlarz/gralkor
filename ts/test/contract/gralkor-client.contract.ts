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
    it("returns { ok: block } when the backend returns a memory block", async () => {
      await setup.configureBackend(client, "recall", { ok: "<gralkor-memory>facts</gralkor-memory>" });
      const r = await client.recall("g1", "s1", "q", "TestAgent");
      expect(r).toEqual({ ok: "<gralkor-memory>facts</gralkor-memory>" });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "recall", { error: "boom" });
      const r = await client.recall("g1", "s1", "q", "TestAgent");
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: recall with a null session_id", () => {
    it("returns { ok: block } when the backend returns a memory block", async () => {
      await setup.configureBackend(client, "recall", { ok: "<gralkor-memory>facts</gralkor-memory>" });
      const r = await client.recall("g1", null, "q", "TestAgent");
      expect(r).toEqual({ ok: "<gralkor-memory>facts</gralkor-memory>" });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "recall", { error: "boom" });
      const r = await client.recall("g1", null, "q", "TestAgent");
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
      const r = await client.capture("s1", "g1", "TestAgent", messages);
      expect(r).toEqual({ ok: true });
    });

    it("returns { error: reason } when the backend fails", async () => {
      await setup.configureBackend(client, "capture", { error: "boom" });
      const r = await client.capture("s1", "g1", "TestAgent", messages);
      expect("error" in r).toBe(true);
    });
  });

  describe("port contract: agentName validation", () => {
    const messages: Message[] = [{ role: "user", content: "q" }];

    it("recall throws at the port boundary when agentName is missing (no backend call)", async () => {
      await setup.configureBackend(client, "recall", { ok: "should-not-be-returned" });
      await expect(
        client.recall("g1", "s1", "q", undefined as unknown as string),
      ).rejects.toThrow(/agent_name/);
    });

    it("recall throws at the port boundary when agentName is blank (no backend call)", async () => {
      await setup.configureBackend(client, "recall", { ok: "should-not-be-returned" });
      await expect(client.recall("g1", "s1", "q", "")).rejects.toThrow(/agent_name/);
      await expect(client.recall("g1", "s1", "q", "   ")).rejects.toThrow(/agent_name/);
    });

    it("capture throws at the port boundary when agentName is missing (no backend call)", async () => {
      await setup.configureBackend(client, "capture", { ok: true });
      await expect(
        client.capture("s1", "g1", undefined as unknown as string, messages),
      ).rejects.toThrow(/agent_name/);
    });

    it("capture throws at the port boundary when agentName is blank (no backend call)", async () => {
      await setup.configureBackend(client, "capture", { ok: true });
      await expect(client.capture("s1", "g1", "", messages)).rejects.toThrow(/agent_name/);
      await expect(client.capture("s1", "g1", "   ", messages)).rejects.toThrow(/agent_name/);
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
