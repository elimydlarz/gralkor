/**
 * Functional test: multi-load resilience.
 *
 * OpenClaw reloads the plugin 4+ times per event. Each reload calls
 * register() → registerFullPlugin() → createReadyGate(). If the gate
 * state is per-instance (closure-scoped), only the first instance's
 * service start resolves its gate — subsequent instances' hooks/tools
 * silently skip graph operations because their gate is still false.
 *
 * This test simulates that scenario end-to-end: create gate A, resolve
 * it (service start), create gate B (plugin reload), verify B sees the
 * resolved state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact } from "../../src/client.js";
import { createReadyGate, resetReadyGate, defaultConfig } from "../../src/config.js";
import { createBeforePromptBuildHandler } from "../../src/hooks.js";
import { createMemoryStoreTool } from "../../src/tools.js";

function mockClient(): { [K in keyof GraphitiClient]: ReturnType<typeof vi.fn> } {
  return {
    health: vi.fn(),
    addEpisode: vi.fn(),
    ingestMessages: vi.fn(),
    search: vi.fn(),
    clearGraph: vi.fn(),
  };
}

function makeFact(overrides: Partial<Fact> = {}): Fact {
  return {
    uuid: "fact-1",
    name: "test-fact",
    fact: "The sky is blue",
    group_id: "default",
    valid_at: null,
    invalid_at: null,
    expired_at: null,
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("multi-load resilience", () => {
  beforeEach(() => {
    resetReadyGate();
  });

  describe("when plugin is loaded multiple times (as OpenClaw does)", () => {
    describe("and the first instance's service resolves the ReadyGate", () => {
      it("then a second instance's auto-recall handler still searches the graph", async () => {
        // Instance A: service starts and resolves the gate
        const gateA = createReadyGate();
        gateA.resolve(); // simulates registerServerService → manager.start() → serverReady.resolve()

        // Instance B: plugin reloads, creates fresh gate — must see resolved state
        const gateB = createReadyGate();

        const client = mockClient();
        client.search.mockResolvedValue({ facts: [makeFact()] });

        const handler = createBeforePromptBuildHandler(
          client as unknown as GraphitiClient,
          defaultConfig,
          { serverReady: gateB },
        );

        const result = await handler(
          { prompt: "Tell me about the project", messages: [] },
          { agentId: "agent-42" },
        );

        expect(client.search).toHaveBeenCalled();
        expect(result).toHaveProperty("prependContext");
        const ctx = (result as { prependContext: string }).prependContext;
        expect(ctx).toContain("The sky is blue");
      });

      it("then a second instance's memory_add tool does not throw", async () => {
        // Instance A resolves
        const gateA = createReadyGate();
        gateA.resolve();

        // Instance B creates fresh gate
        const gateB = createReadyGate();

        const client = mockClient();
        client.addEpisode.mockResolvedValue({});

        const tool = createMemoryStoreTool(
          client as unknown as GraphitiClient,
          defaultConfig,
          { getGroupId: () => "agent-42", serverReady: gateB },
        );

        await tool.execute("call-1", { content: "Remember this" });
        expect(client.addEpisode).toHaveBeenCalledTimes(1);
      });
    });

    describe("and no instance has resolved the ReadyGate", () => {
      it("then auto-recall handler throws (fail-fast)", async () => {
        // Neither instance resolves — simulates server never starting
        const gateA = createReadyGate();
        const gateB = createReadyGate();
        void gateA; // unused, just showing two instances exist

        const client = mockClient();
        const handler = createBeforePromptBuildHandler(
          client as unknown as GraphitiClient,
          defaultConfig,
          { serverReady: gateB },
        );

        await expect(
          handler(
            { prompt: "Tell me about the project" },
            { agentId: "agent-42" },
          ),
        ).rejects.toThrow("server is not ready");
        expect(client.search).not.toHaveBeenCalled();
      });

      it("then memory_add tool throws (fail-fast)", async () => {
        const gateA = createReadyGate();
        const gateB = createReadyGate();
        void gateA;

        const client = mockClient();
        const tool = createMemoryStoreTool(
          client as unknown as GraphitiClient,
          defaultConfig,
          { getGroupId: () => "agent-42", serverReady: gateB },
        );

        await expect(
          tool.execute("call-1", { content: "Remember this" }),
        ).rejects.toThrow("server is not ready");
        expect(client.addEpisode).not.toHaveBeenCalled();
      });
    });
  });
});
