import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact, EntityNode } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  extractMessagesFromCtx,
} from "./hooks.js";

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

describe("extractMessagesFromCtx", () => {
  it("returns empty string when no messages", () => {
    expect(extractMessagesFromCtx({})).toBe("");
    expect(extractMessagesFromCtx({ messages: [] })).toBe("");
  });

  it("extracts a single user+assistant exchange", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
      ],
    });
    expect(result).toBe("User: Hello\nAssistant: Hi there");
  });

  it("accumulates all messages in sequence", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "First question" }] },
        { role: "assistant", content: [{ type: "text", text: "First answer" }] },
        { role: "user", content: [{ type: "text", text: "Second question" }] },
        { role: "assistant", content: [{ type: "text", text: "Second answer" }] },
      ],
    });
    expect(result).toBe(
      "User: First question\nAssistant: First answer\nUser: Second question\nAssistant: Second answer",
    );
  });

  it("skips messages with no text content", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "toolCall" }] },
        { role: "toolResult", content: [{ type: "text", text: "tool output" }] },
        { role: "assistant", content: [{ type: "text", text: "Done" }] },
      ],
    });
    expect(result).toBe("User: Hello\nAssistant: Done");
  });

  it("joins multiple text blocks within one message", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [
          { type: "text", text: "Part 1" },
          { type: "text", text: "Part 2" },
        ]},
      ],
    });
    expect(result).toBe("User: Part 1\nPart 2");
  });
});

describe("before_agent_start handler", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.searchNodes.mockResolvedValue([]);
  });

  it("returns context with matching facts", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "Project uses microservices" }),
    ]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    expect(result).toHaveProperty("prependContext");
    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Project uses microservices");
    expect(ctx_result).toContain("gralkor-memory");
    expect(ctx_result).toContain('trust="untrusted"');
    expect(ctx_result).toContain("Facts from knowledge graph:");
  });

  it("returns context with matching entities", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([
      makeNode({ name: "Microservices", summary: "Architecture pattern" }),
    ]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      userMessage: "Tell me about the project architecture",
    });

    expect(result).toHaveProperty("prependContext");
    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Entities from knowledge graph:");
    expect(ctx_result).toContain("Microservices: Architecture pattern");
  });

  it("includes native memory results when getNativeSearch is provided", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);
    const nativeSearch = vi.fn().mockResolvedValue("Native result: project notes");
    const getNativeSearch = () => nativeSearch;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler({
      userMessage: "Tell me about the project architecture",
    });

    expect(result).toHaveProperty("prependContext");
    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("From native memory:");
    expect(ctx_result).toContain("Native result: project notes");
    expect(nativeSearch).toHaveBeenCalled();
  });

  it("combines facts, nodes, and native results", async () => {
    client.searchFacts.mockResolvedValue([makeFact({ fact: "A fact" })]);
    client.searchNodes.mockResolvedValue([makeNode({ name: "Entity", summary: "A summary" })]);
    const nativeSearch = vi.fn().mockResolvedValue("Native data");
    const getNativeSearch = () => nativeSearch;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler({
      userMessage: "Tell me about the project architecture",
    });

    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Facts from knowledge graph:");
    expect(ctx_result).toContain("Entities from knowledge graph:");
    expect(ctx_result).toContain("From native memory:");
  });

  it("skips native results when getNativeSearch returns null", async () => {
    client.searchFacts.mockResolvedValue([makeFact({ fact: "A fact" })]);
    client.searchNodes.mockResolvedValue([]);
    const getNativeSearch = () => null;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler({
      userMessage: "Tell me about the project architecture",
    });

    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Facts from knowledge graph:");
    expect(ctx_result).not.toContain("From native memory:");
  });

  it("degrades gracefully when native search fails", async () => {
    client.searchFacts.mockResolvedValue([makeFact({ fact: "A fact" })]);
    client.searchNodes.mockResolvedValue([]);
    const nativeSearch = vi.fn().mockRejectedValue(new Error("native error"));
    const getNativeSearch = () => nativeSearch;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler({
      userMessage: "Tell me about the project architecture",
    });

    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Facts from knowledge graph:");
    expect(ctx_result).not.toContain("From native memory:");
  });

  it("skips when autoRecall is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: false, maxResults: 5 },
    };

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    const result = await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("skips when no user message in context", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({ agentId: "agent-42" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("searches using key terms from user message", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("returns undefined when no results from any source", async () => {
    client.searchFacts.mockResolvedValue([]);
    client.searchNodes.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    expect(result).toBeUndefined();
  });

  it("degrades silently when Graphiti is unreachable", async () => {
    client.searchFacts.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    expect(result).toBeUndefined();
  });

  it("respects maxResults config", async () => {
    client.searchFacts.mockResolvedValue([]);
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: true, maxResults: 3 },
    };

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    expect(client.searchFacts).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      3,
    );
    expect(client.searchNodes).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      3,
    );
  });

  it("strips stop words from user message for search query", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      agentId: "agent-42",
      userMessage: "Tell me about the project architecture",
    });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).not.toContain("the");
    expect(query).not.toContain("about");
    expect(query).toContain("tell");
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("filters words shorter than 3 characters", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      agentId: "agent-42",
      userMessage: "Go do it now please",
    });

    const query = client.searchFacts.mock.calls[0]?.[0] as string | undefined;
    // "go" (2 chars), "do" (stop word + 2 chars), "it" (stop word), "now" (stop word), "please" (3+ chars)
    // Only "please" should survive
    if (query) {
      expect(query).not.toMatch(/\bgo\b/);
      expect(query).toContain("please");
    }
  });

  it("strips punctuation from user message", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      agentId: "agent-42",
      userMessage: "What's the project's architecture?",
    });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).not.toContain("?");
    expect(query).not.toContain("'");
  });

  it("limits extracted terms to 8 words", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      agentId: "agent-42",
      userMessage: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
    });

    const query = client.searchFacts.mock.calls[0][0] as string;
    const words = query.split(" ");
    expect(words.length).toBeLessThanOrEqual(8);
  });

  it("skips search when user message yields empty query after stop-word removal", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    // All words are stop words or <= 2 chars: "is" (stop), "it" (stop), "by" (stop), "us" (stop)
    const result = await handler({
      agentId: "agent-42",
      userMessage: "is it by us",
    });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("calls setGroupId with agentId when provided", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler({ agentId: "agent-42", userMessage: "Tell me about the project architecture" });

    expect(setGroupId).toHaveBeenCalledWith("agent-42");
  });

  it("does not call setGroupId when agentId is missing", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler({ userMessage: "Tell me about the project architecture" });

    expect(setGroupId).not.toHaveBeenCalled();
  });
});

describe("agent_end handler", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("captures conversation from messages array", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
      ],
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toBe("User: What is the weather?\nAssistant: I don't have access to weather data.");
  });

  it("captures multi-turn conversations", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny." }] },
        { role: "user", content: [{ type: "text", text: "And tomorrow?" }] },
        { role: "assistant", content: [{ type: "text", text: "Rain expected." }] },
      ],
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toBe(
      "User: What is the weather?\nAssistant: It's sunny.\nUser: And tomorrow?\nAssistant: Rain expected.",
    );
  });

  it("uses agent's group_id partition", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      agentId: "agent-42",
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
      ],
    });

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "agent-42" }),
    );
  });

  it("skips when autoCapture is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoCapture: { enabled: false },
    };

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, config);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "Sunny." }] },
      ],
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips when no messages extracted", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [],
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips messages starting with /", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "/status check everything" }] },
        { role: "assistant", content: [{ type: "text", text: "All systems operational and running smoothly." }] },
      ],
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("propagates errors when Graphiti is unreachable", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);

    await expect(handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
      ],
    })).rejects.toThrow("ECONNREFUSED");
  });

  it("formats episode body with auto-capture metadata", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny today." }] },
      ],
    });

    const call = client.addEpisode.mock.calls[0][0] as {
      episode_body: string;
      source_description: string;
      name: string;
    };
    expect(call.episode_body).toBe("User: What is the weather?\nAssistant: It's sunny today.");
    expect(call.source_description).toBe("auto-capture");
    expect(call.name).toMatch(/^conversation-\d+$/);
  });

  it("falls back to 'default' group when agentId is missing", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "This is a long enough message to pass the filter" }] },
        { role: "assistant", content: [{ type: "text", text: "Here is a response that is also long enough" }] },
      ],
    });

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "default" }),
    );
  });
});
