import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact, EntityNode } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  createMemoryRecallTool,
  createMemoryStoreTool,
  createMemoryForgetTool,
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
const ctx = { agentId: "agent-42" };

describe("memory_recall", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  it("has the correct tool shape", () => {
    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("memory_recall");
    expect(tool.parameters.required).toContain("query");
    expect(typeof tool.execute).toBe("function");
  });

  it("searches both agent and shared partitions", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    await tool.execute({ query: "test" }, ctx);

    expect(client.searchFacts).toHaveBeenCalledWith(
      "test",
      ["agent-42", "agent-family"],
      10,
    );
    expect(client.searchNodes).toHaveBeenCalledWith(
      "test",
      ["agent-42", "agent-family"],
      10,
    );
  });

  it("respects the limit parameter", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    await tool.execute({ query: "test", limit: 3 }, ctx);

    expect(client.searchFacts).toHaveBeenCalledWith(
      "test",
      expect.any(Array),
      3,
    );
  });

  it("tags own facts as [own] and shared as [family]", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "own fact" }),
      makeFact({ group_id: "agent-family", fact: "shared fact" }),
    ]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ query: "test" }, ctx);

    expect(result).toContain("[own] own fact");
    expect(result).toContain("[family] shared fact");
  });

  it("shows invalidation date for expired facts", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ invalid_at: "2025-06-01T00:00:00Z", fact: "old fact" }),
    ]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ query: "test" }, ctx);

    expect(result).toContain("(invalid since 2025-06-01T00:00:00Z)");
  });

  it("includes entity nodes in output", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([makeNode()]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ query: "test" }, ctx);

    expect(result).toContain("**Sky**");
    expect(result).toContain("The atmosphere above the Earth");
  });

  it("returns 'No facts found.' when empty", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const tool = createMemoryRecallTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ query: "test" }, ctx);

    expect(result).toContain("No facts found.");
  });
});

describe("memory_store", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("has the correct tool shape", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("memory_store");
    expect(tool.parameters.required).toContain("content");
  });

  it("writes to both agent and shared partitions", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    await tool.execute({ content: "Remember this" }, ctx);

    expect(client.addEpisode).toHaveBeenCalledTimes(2);

    const calls = client.addEpisode.mock.calls;
    const groupIds = calls.map((c: unknown[]) => (c[0] as { group_id: string }).group_id);
    expect(groupIds).toContain("agent-42");
    expect(groupIds).toContain("agent-family");
  });

  it("uses manual source description by default", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    await tool.execute({ content: "Remember this" }, ctx);

    const call = client.addEpisode.mock.calls[0][0] as { source_description: string };
    expect(call.source_description).toBe("manual memory_store");
  });

  it("uses provided source description", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    await tool.execute({ content: "Remember this", source: "user request" }, ctx);

    const call = client.addEpisode.mock.calls[0][0] as { source_description: string };
    expect(call.source_description).toBe("user request");
  });

  it("returns success message", async () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ content: "x" }, ctx);

    expect(result).toContain("Stored successfully");
  });
});

describe("memory_forget", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  it("has the correct tool shape", () => {
    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("memory_forget");
  });

  it("deletes episode by uuid", async () => {
    client.deleteEpisode.mockResolvedValue(undefined);

    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ uuid: "ep-123" }, ctx);

    expect(client.deleteEpisode).toHaveBeenCalledWith("ep-123");
    expect(result).toContain("Deleted episode ep-123");
  });

  it("falls back to deleting edge if episode delete fails", async () => {
    client.deleteEpisode.mockRejectedValue(new Error("not found"));
    client.deleteEdge.mockResolvedValue(undefined);

    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ uuid: "edge-456" }, ctx);

    expect(client.deleteEdge).toHaveBeenCalledWith("edge-456");
    expect(result).toContain("Deleted edge edge-456");
  });

  it("reports not found when both deletes fail", async () => {
    client.deleteEpisode.mockRejectedValue(new Error("not found"));
    client.deleteEdge.mockRejectedValue(new Error("not found"));

    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ uuid: "bad-uuid" }, ctx);

    expect(result).toContain("Could not find item");
  });

  it("searches and lists matching facts when given a query", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ uuid: "f-1", fact: "something" }),
    ]);

    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ query: "something" }, ctx);

    expect(result).toContain("[f-1]");
    expect(result).toContain("something");
  });

  it("reports no matches when query finds nothing", async () => {
    client.searchFacts.mockResolvedValue([]);

    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({ query: "nonexistent" }, ctx);

    expect(result).toContain("No matching items found");
  });

  it("asks for query or uuid when neither is provided", async () => {
    const tool = createMemoryForgetTool(client as unknown as GraphitiClient, config);
    const result = await tool.execute({}, ctx);

    expect(result).toContain("provide either a query or a uuid");
  });
});
