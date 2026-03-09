import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact, EntityNode, Episode, Community } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  createMemoryStoreTool,
  formatFacts,
  formatNodes,
  formatEpisodes,
  formatCommunities,
  formatSearchResults,
} from "./tools.js";

function mockClient(): {
  [K in keyof GraphitiClient]: ReturnType<typeof vi.fn>;
} {
  return {
    health: vi.fn(),
    addEpisode: vi.fn(),
    search: vi.fn(),
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

const config: GralkorConfig = defaultConfig;
const getGroupId = () => "agent-42";

describe("formatFacts", () => {
  it("formats facts with header", () => {
    const result = formatFacts([makeFact({ fact: "remembered fact" })]);
    expect(result).toContain("Facts (knowledge graph):");
    expect(result).toContain("- remembered fact");
  });

  it("shows valid_at date", () => {
    const result = formatFacts([makeFact({ valid_at: "2025-01-01T00:00:00Z", fact: "known fact" })]);
    expect(result).toContain("- known fact (valid from 2025-01-01T00:00:00Z)");
  });

  it("shows invalidation date", () => {
    const result = formatFacts([makeFact({ invalid_at: "2025-06-01T00:00:00Z", fact: "old fact" })]);
    expect(result).toContain("(invalid since 2025-06-01T00:00:00Z)");
  });

  it("shows both valid_at and invalid_at", () => {
    const result = formatFacts([makeFact({
      valid_at: "2025-01-01T00:00:00Z",
      invalid_at: "2025-06-01T00:00:00Z",
      fact: "outdated fact",
    })]);
    expect(result).toContain("- outdated fact (valid from 2025-01-01T00:00:00Z) (invalid since 2025-06-01T00:00:00Z)");
  });

  it("returns 'No graph facts found.' when empty", () => {
    expect(formatFacts([])).toBe("No graph facts found.");
  });
});

describe("memory_store (createMemoryStoreTool)", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("defaults to memory_add name", () => {
    const tool = createMemoryStoreTool(client as unknown as GraphitiClient, config);
    expect(tool.name).toBe("memory_add");
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

function makeNode(overrides: Partial<EntityNode> = {}): EntityNode {
  return {
    uuid: "node-1",
    name: "Alice",
    summary: "A person",
    group_id: "default",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    uuid: "ep-1",
    name: "test-episode",
    content: "Some conversation content",
    source_description: "auto-capture",
    group_id: "default",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCommunity(overrides: Partial<Community> = {}): Community {
  return {
    uuid: "comm-1",
    name: "AI Research",
    summary: "Topics about artificial intelligence",
    group_id: "default",
    created_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("formatNodes", () => {
  it("formats nodes with header", () => {
    const result = formatNodes([makeNode({ name: "Alice", summary: "A developer" })]);
    expect(result).toContain("Entities:");
    expect(result).toContain("- Alice: A developer");
  });

  it("returns empty string when no nodes", () => {
    expect(formatNodes([])).toBe("");
  });

  it("formats multiple nodes", () => {
    const result = formatNodes([
      makeNode({ name: "Alice", summary: "A developer" }),
      makeNode({ name: "Bob", summary: "A designer" }),
    ]);
    expect(result).toContain("- Alice: A developer");
    expect(result).toContain("- Bob: A designer");
  });
});

describe("formatEpisodes", () => {
  it("formats episodes with header", () => {
    const result = formatEpisodes([makeEpisode({ content: "User asked about weather" })]);
    expect(result).toContain("Episodes:");
    expect(result).toContain("- User asked about weather");
  });

  it("returns empty string when no episodes", () => {
    expect(formatEpisodes([])).toBe("");
  });

  it("truncates long content", () => {
    const longContent = "A".repeat(300);
    const result = formatEpisodes([makeEpisode({ content: longContent })]);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan(longContent.length + 50);
  });
});

describe("formatCommunities", () => {
  it("formats communities with header", () => {
    const result = formatCommunities([makeCommunity({ name: "AI", summary: "AI topics" })]);
    expect(result).toContain("Topics:");
    expect(result).toContain("- AI: AI topics");
  });

  it("returns empty string when no communities", () => {
    expect(formatCommunities([])).toBe("");
  });
});

describe("formatSearchResults", () => {
  it("combines all non-empty sections", () => {
    const result = formatSearchResults({
      facts: [makeFact({ fact: "A knows B" })],
      nodes: [makeNode({ name: "Alice", summary: "A person" })],
      episodes: [makeEpisode({ content: "Test episode" })],
      communities: [makeCommunity({ name: "People", summary: "People cluster" })],
    });
    expect(result).toContain("Facts (knowledge graph):");
    expect(result).toContain("Entities:");
    expect(result).toContain("Episodes:");
    expect(result).toContain("Topics:");
  });

  it("returns fallback when all empty", () => {
    const result = formatSearchResults({
      facts: [],
      nodes: [],
      episodes: [],
      communities: [],
    });
    expect(result).toBe("No graph results found.");
  });

  it("only includes non-empty sections", () => {
    const result = formatSearchResults({
      facts: [makeFact({ fact: "A knows B" })],
      nodes: [],
      episodes: [],
      communities: [],
    });
    expect(result).toContain("Facts (knowledge graph):");
    expect(result).not.toContain("Entities:");
    expect(result).not.toContain("Episodes:");
    expect(result).not.toContain("Topics:");
  });
});
