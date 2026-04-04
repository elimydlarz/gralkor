import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig, createReadyGate, resetReadyGate } from "./config.js";
import {
  createMemoryStoreTool,
  createBuildIndicesTool,
  createBuildCommunitiesTool,
  formatFacts,
  formatTimestamp,
} from "./tools.js";

function mockClient(): {
  [K in keyof GraphitiClient]: ReturnType<typeof vi.fn>;
} {
  return {
    health: vi.fn(),
    addEpisode: vi.fn(),
    ingestEpisode: vi.fn(),
    search: vi.fn(),
    buildIndices: vi.fn(),
    buildCommunities: vi.fn(),
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

const config: GralkorConfig = defaultConfig;
const getGroupId = () => "agent-42";

describe("formatTimestamp", () => {
  it("converts Z to +0", () => {
    expect(formatTimestamp("2025-01-01T00:00:00Z")).toBe("2025-01-01T00:00:00+0");
  });
  it("converts +00:00 to +0", () => {
    expect(formatTimestamp("2026-04-03T23:03:51+00:00")).toBe("2026-04-03T23:03:51+0");
  });
  it("strips sub-second precision", () => {
    expect(formatTimestamp("2026-04-03T23:03:51.752246+00:00")).toBe("2026-04-03T23:03:51+0");
  });
  it("strips leading zero from offset hours and drops :00 minutes", () => {
    expect(formatTimestamp("2025-06-01T10:00:00-05:00")).toBe("2025-06-01T10:00:00-5");
  });
  it("keeps non-zero minutes in offset", () => {
    expect(formatTimestamp("2025-06-01T10:00:00+05:30")).toBe("2025-06-01T10:00:00+5:30");
  });
});

describe("formatFacts", () => {
  it("formats facts with header", () => {
    const result = formatFacts([makeFact({ fact: "remembered fact" })]);
    expect(result).toContain("Facts:");
    expect(result).toContain("- remembered fact");
  });

  it("includes all timestamps when present", () => {
    const result = formatFacts([makeFact({
      created_at: "2025-01-01T00:00:00Z",
      valid_at: "2025-01-01T00:00:00Z",
      invalid_at: "2025-06-01T00:00:00Z",
      expired_at: "2025-07-01T00:00:00Z",
      fact: "fully dated fact",
    })]);
    expect(result).toContain("- fully dated fact (created 2025-01-01T00:00:00+0) (valid from 2025-01-01T00:00:00+0) (invalid since 2025-06-01T00:00:00+0) (expired 2025-07-01T00:00:00+0)");
  });

  it("includes created_at even when valid_at and invalid_at are absent", () => {
    const result = formatFacts([makeFact({ created_at: "2025-03-15T10:00:00Z", fact: "recent fact" })]);
    expect(result).toContain("- recent fact (created 2025-03-15T10:00:00+0)");
    expect(result).not.toContain("valid from");
    expect(result).not.toContain("invalid since");
    expect(result).not.toContain("expired");
    expect(result).toMatch(/- recent fact \(created 2025-03-15T10:00:00\+0\)\s*$/m);
  });

  it("separates multiple facts with newlines", () => {
    const result = formatFacts([
      makeFact({ fact: "Fact A" }),
      makeFact({ fact: "Fact B" }),
    ]);
    expect(result).toMatch(/- Fact A[^\n]*\n- Fact B/);
  });

  it("returns 'No graph facts found.' when empty", () => {
    expect(formatFacts([])).toBe("No graph facts found.");
  });
});

describe("memory_store (createMemoryStoreTool)", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    resetReadyGate();
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("defaults to memory_add name", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("memory_add");
    expect(tool.parameters.required).toContain("content");
  });

  it("accepts name override for memory_add", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { overrides: { name: "memory_add" } });
    expect(tool.name).toBe("memory_add");
  });

  it("writes to the agent partition", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await tool.execute("call-1", { content: "Remember this" });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "agent-42" }),
    );
  });

  it("uses manual source description by default", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await tool.execute("call-1", { content: "Remember this" });

    const call = client.addEpisode.mock.calls[0][0] as { source_description: string };
    expect(call.source_description).toBe("manual memory_store");
  });

  it("uses provided source description", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await tool.execute("call-1", { content: "Remember this", source_description: "user request" });

    const call = client.addEpisode.mock.calls[0][0] as { source_description: string };
    expect(call.source_description).toBe("user request");
  });

  it("returns success message", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    const result = await tool.execute("call-1", { content: "x" });

    expect(result).toContain("Stored successfully");
  });

  it("passes content as episode_body and generates name", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await tool.execute("call-1", { content: "Important insight" });

    const call = client.addEpisode.mock.calls[0][0] as {
      name: string;
      episode_body: string;
    };
    expect(call.episode_body).toBe("Important insight");
    expect(call.name).toMatch(/^memory-store-\d+$/);
  });

  it("passes text as episode source type", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await tool.execute("call-1", { content: "A reflection" });

    const call = client.addEpisode.mock.calls[0][0] as { source: string };
    expect(call.source).toBe("text");
  });

  it("propagates errors when addEpisode throws", async () => {
    client.addEpisode.mockRejectedValue(new Error("server down"));

    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await expect(tool.execute("call-1", { content: "x" })).rejects.toThrow("server down");
  });

  it("logs episode body in test mode", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const testConfig: GralkorConfig = { ...config, test: true };
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, testConfig, { getGroupId });
    await tool.execute("call-1", { content: "Important insight" });

    const testLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("[test] episode body:"),
    );
    expect(testLogs).toHaveLength(1);
    expect(testLogs[0][0]).toContain("Important insight");
    consoleSpy.mockRestore();
  });

  it("does not log episode body when test mode is off", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId });
    await tool.execute("call-1", { content: "Important insight" });

    const testLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("[test]"),
    );
    expect(testLogs).toHaveLength(0);
    consoleSpy.mockRestore();
  });

  describe("when server is NOT ready", () => {
    it("throws when server is not ready", async () => {
      const gate = createReadyGate();
      const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId, serverReady: gate });

      await expect(tool.execute("call-1", { content: "Remember this" })).rejects.toThrow(
        "[gralkor] memory_add failed: server is not ready",
      );
      expect(client.addEpisode).not.toHaveBeenCalled();
    });
  });

  describe("when server IS ready", () => {
    it("stores episode as normal", async () => {
      const gate = createReadyGate();
      gate.resolve();
      const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { getGroupId, serverReady: gate });
      await tool.execute("call-1", { content: "Remember this" });

      expect(client.addEpisode).toHaveBeenCalledTimes(1);
    });
  });
});

describe("memory_build_indices (createBuildIndicesTool)", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    resetReadyGate();
    client = mockClient();
    client.buildIndices.mockResolvedValue({ status: "ok" });
  });

  describe("when server is ready", () => {
    it("calls client.buildIndices and returns success message", async () => {
      const gate = createReadyGate();
      gate.resolve();
      const tool = createBuildIndicesTool(client as unknown as GraphitiClient, { serverReady: gate });
      const result = await tool.execute();

      expect(client.buildIndices).toHaveBeenCalledTimes(1);
      expect(result).toContain("Indices rebuilt successfully");
    });
  });

  describe("when server is not ready", () => {
    it("throws error", async () => {
      const gate = createReadyGate();
      const tool = createBuildIndicesTool(client as unknown as GraphitiClient, { serverReady: gate });

      await expect(tool.execute()).rejects.toThrow(
        "[gralkor] memory_build_indices failed: server is not ready",
      );
      expect(client.buildIndices).not.toHaveBeenCalled();
    });
  });
});

describe("memory_build_communities (createBuildCommunitiesTool)", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    resetReadyGate();
    client = mockClient();
    client.buildCommunities.mockResolvedValue({ communities: 5, edges: 12 });
  });

  describe("when server is ready", () => {
    it("calls client.buildCommunities with group ID and returns counts", async () => {
      const gate = createReadyGate();
      gate.resolve();
      const tool = createBuildCommunitiesTool(client as unknown as GraphitiClient, { getGroupId, serverReady: gate });
      const result = await tool.execute();

      expect(client.buildCommunities).toHaveBeenCalledWith("agent-42");
      expect(result).toContain("5 communities");
      expect(result).toContain("12 edges");
    });
  });

  describe("when server is not ready", () => {
    it("throws error", async () => {
      const gate = createReadyGate();
      const tool = createBuildCommunitiesTool(client as unknown as GraphitiClient, { getGroupId, serverReady: gate });

      await expect(tool.execute()).rejects.toThrow(
        "[gralkor] memory_build_communities failed: server is not ready",
      );
      expect(client.buildCommunities).not.toHaveBeenCalled();
    });
  });
});

