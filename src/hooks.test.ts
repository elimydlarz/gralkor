import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import { createBeforeAgentStartHandler, createAgentEndHandler } from "./hooks.js";

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

describe("before_agent_start handler", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  it("returns context with matching facts", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "Project uses microservices" }),
    ]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      userMessage: "Tell me about the project architecture",
      agentId: "agent-42",
    });

    expect(result).toHaveProperty("prependContext");
    const prepend = (result as { prependContext: string }).prependContext;
    expect(prepend).toContain("Project uses microservices");
    expect(prepend).toContain("gralkor-memory");
    expect(prepend).toContain('trust="untrusted"');
    expect(prepend).toContain("Relevant facts from knowledge graph:");
  });

  it("skips when autoRecall is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: false, maxResults: 5 },
    };

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    const result = await handler({
      userMessage: "Tell me about the project architecture",
      agentId: "agent-42",
    });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("skips when no user message in ctx", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({ agentId: "agent-42" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("searches with key terms from user message", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ userMessage: "Tell me about the project architecture", agentId: "agent-42" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("returns undefined when no facts match", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      userMessage: "Tell me about the project architecture",
      agentId: "agent-42",
    });

    expect(result).toBeUndefined();
  });

  it("degrades gracefully when Graphiti is unreachable", async () => {
    client.searchFacts.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({
      userMessage: "Tell me about the project architecture",
      agentId: "agent-42",
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
    await handler({ userMessage: "Tell me about the project architecture", agentId: "agent-42" });

    expect(client.searchFacts).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      3,
    );
  });

  it("strips stop words from user message for search query", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ userMessage: "Tell me about the project architecture" });

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
    await handler({ userMessage: "Go do it now please" });

    const query = client.searchFacts.mock.calls[0]?.[0] as string | undefined;
    if (query) {
      expect(query).not.toMatch(/\bgo\b/);
      expect(query).toContain("please");
    }
  });

  it("strips punctuation from user message", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ userMessage: "What's the project's architecture?" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).not.toContain("?");
    expect(query).not.toContain("'");
  });

  it("limits extracted terms to 8 words", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
    });

    const query = client.searchFacts.mock.calls[0][0] as string;
    const words = query.split(" ");
    expect(words.length).toBeLessThanOrEqual(8);
  });

  it("skips search when user message yields empty query after stop-word removal", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({ userMessage: "is it by us" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("calls setGroupId with agentId when provided", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler({ userMessage: "Tell me about the project architecture", agentId: "agent-42" });

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

  it("captures conversation to agent partition", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "What is the weather?",
      agentResponse: "I don't have access to weather data.",
      agentId: "agent-42",
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
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
      userMessage: "What is the weather?",
      agentResponse: "Sunny.",
      agentId: "agent-42",
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips trivially short exchanges", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "hi",
      agentResponse: "hey",
      agentId: "agent-42",
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips messages starting with /", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "/status check everything",
      agentResponse: "All systems operational and running smoothly.",
      agentId: "agent-42",
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("degrades gracefully when Graphiti is unreachable", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);

    // Should not throw
    await handler({
      userMessage: "What is the weather?",
      agentResponse: "I don't have access to weather data.",
      agentId: "agent-42",
    });
  });

  it("formats episode body as User/Assistant format", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "What is the weather?",
      agentResponse: "It's sunny today.",
      agentId: "agent-42",
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

  it("captures when userMessage is short but agentResponse is long", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "hi",
      agentResponse: "Hello! How can I help you today?",
      agentId: "agent-42",
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("captures when agentResponse is short but userMessage is long", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "Can you explain the architecture of this project?",
      agentResponse: "Sure.",
      agentId: "agent-42",
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("defaults missing messages to empty strings", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "This is a long enough message to pass the filter",
      agentId: "agent-42",
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toContain("Assistant: ");
  });

  it("falls back to 'default' group when agentId is missing", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      userMessage: "This is a long enough message to pass the filter",
      agentResponse: "Here is a response that is also long enough",
    });

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "default" }),
    );
  });
});
