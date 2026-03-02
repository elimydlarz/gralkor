import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact, EntityNode } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  createMemoryStoreTool,
  formatFacts,
  formatNodes,
} from "./tools.js";

function mockClient(): {
  [K in keyof GraphitiClient]: ReturnType<typeof vi.fn>;
} {
  return {
    health: vi.fn(),
    addEpisode: vi.fn(),
    searchFacts: vi.fn(),
    searchNodes: vi.fn(),
    getEpisodes: vi.fn(),
    deleteEpisode: vi.fn(),
    deleteEdge: vi.fn(),
    clearGraph: vi.fn(),
    getStatus: vi.fn(),
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
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeNode(overrides: Partial<EntityNode> = {}): EntityNode {
  return {
    uuid: "node-1",
    name: "Sky",
    summary: "The atmosphere above the Earth",
    group_id: "default",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

const config: GralkorConfig = defaultConfig;
const getGroupId = () => "agent-42";

describe("formatFacts", () => {
  it("formats facts with header", () => {
    const result = formatFacts([makeFact({ fact: "remembered fact" })]);
    expect(result).toContain("Facts (knowledge graph):");
    expect(result).toContain("- remembered fact");
  });

  it("shows invalidation date", () => {
    const result = formatFacts([makeFact({ invalid_at: "2025-06-01T00:00:00Z", fact: "old fact" })]);
    expect(result).toContain("(invalid since 2025-06-01T00:00:00Z)");
  });

  it("returns 'No graph facts found.' when empty", () => {
    expect(formatFacts([])).toBe("No graph facts found.");
  });
});

describe("formatNodes", () => {
  it("formats nodes with header", () => {
    const result = formatNodes([makeNode()]);
    expect(result).toContain("Entities (knowledge graph):");
    expect(result).toContain("**Sky**");
    expect(result).toContain("The atmosphere above the Earth");
  });

  it("returns empty string when empty", () => {
    expect(formatNodes([])).toBe("");
  });
});

describe("graph_search (createMemoryRecallTool)", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  it("has the correct tool shape", () => {
    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("graph_search");
    expect(tool.parameters.required).toContain("query");
    expect(typeof tool.execute).toBe("function");
  });

  it("searches the agent partition", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await tool.execute("call-1", { query: "test" });

    expect(client.searchFacts).toHaveBeenCalledWith(
      "test",
      ["agent-42"],
      10,
    );
    expect(client.searchNodes).toHaveBeenCalledWith(
      "test",
      ["agent-42"],
      10,
    );
  });

  it("respects the limit parameter", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await tool.execute("call-1", { query: "test", limit: 3 });

    expect(client.searchFacts).toHaveBeenCalledWith(
      "test",
      expect.any(Array),
      3,
    );
  });

  it("formats facts with knowledge graph header", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "remembered fact" }),
    ]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    const result = await tool.execute("call-1", { query: "test" });

    expect(result).toContain("Facts (knowledge graph):");
    expect(result).toContain("- remembered fact");
  });

  it("includes entity nodes with knowledge graph header", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([makeNode()]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    const result = await tool.execute("call-1", { query: "test" });

    expect(result).toContain("Entities (knowledge graph):");
    expect(result).toContain("**Sky**");
    expect(result).toContain("The atmosphere above the Earth");
  });

  it("returns 'No graph facts found.' when empty", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    const result = await tool.execute("call-1", { query: "test" });

    expect(result).toContain("No graph facts found.");
  });

  it("accepts ToolOverrides for name and description", () => {
    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, {
      name: "graph_search",
      description: "Custom description",
    });
    expect(tool.name).toBe("graph_search");
    expect(tool.description).toBe("Custom description");
  });

  it("propagates errors when searchFacts throws", async () => {
    client.searchFacts.mockRejectedValue(new Error("connection refused"));
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await expect(tool.execute("call-1", { query: "test" })).rejects.toThrow("connection refused");
  });

  it("propagates errors when searchNodes throws", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockRejectedValue(new Error("timeout"));

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await expect(tool.execute("call-1", { query: "test" })).rejects.toThrow("timeout");
  });

  it("falls back to 'default' group when no getGroupId provided", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    await tool.execute("call-1", { query: "test" });

    expect(client.searchFacts).toHaveBeenCalledWith("test", ["default"], 10);
  });
});

describe("memory_store (createMemoryStoreTool)", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("defaults to graph_add name", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("graph_add");
    expect(tool.parameters.required).toContain("content");
  });

  it("accepts name override for memory_add", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, { name: "memory_add" });
    expect(tool.name).toBe("memory_add");
  });

  it("writes to the agent partition", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await tool.execute("call-1", { content: "Remember this" });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "agent-42" }),
    );
  });

  it("uses manual source description by default", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await tool.execute("call-1", { content: "Remember this" });

    const call = client.addEpisode.mock.calls[0][0] as { source_description: string };
    expect(call.source_description).toBe("manual memory_store");
  });

  it("uses provided source description", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await tool.execute("call-1", { content: "Remember this", source: "user request" });

    const call = client.addEpisode.mock.calls[0][0] as { source_description: string };
    expect(call.source_description).toBe("user request");
  });

  it("returns success message", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    const result = await tool.execute("call-1", { content: "x" });

    expect(result).toContain("Stored successfully");
  });

  it("passes content as episode_body and generates name", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await tool.execute("call-1", { content: "Important insight" });

    const call = client.addEpisode.mock.calls[0][0] as {
      name: string;
      episode_body: string;
    };
    expect(call.episode_body).toBe("Important insight");
    expect(call.name).toMatch(/^memory-store-\d+$/);
  });

  it("accepts ToolOverrides for name and description", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, {
      name: "memory_add",
      description: "Custom store description",
    });
    expect(tool.name).toBe("memory_add");
    expect(tool.description).toBe("Custom store description");
  });

  it("propagates errors when addEpisode throws", async () => {
    client.addEpisode.mockRejectedValue(new Error("server down"));

    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config, undefined, getGroupId);
    await expect(tool.execute("call-1", { content: "x" })).rejects.toThrow("server down");
  });
});
