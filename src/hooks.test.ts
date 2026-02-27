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

  it("returns context with matching facts and graph label", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "Project uses microservices" }),
    ]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toHaveProperty("prependContext");
    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Project uses microservices");
    expect(ctx_result).toContain("gralkor-memory");
    expect(ctx_result).toContain('trust="untrusted"');
    expect(ctx_result).toContain("Relevant facts from knowledge graph:");
  });

  it("skips when autoRecall is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: false, maxResults: 5 },
    };

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("skips when no user message in args", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({}, { agentId: "agent-42" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("reads prompt from event.prompt (two-arg form)", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ prompt: "Tell me about the project architecture" }, { agentId: "agent-42" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("reads userMessage from single-arg ctx (gateway convention)", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ userMessage: "Tell me about the project architecture", agentId: "agent-42" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("falls back to event.messages when prompt is missing", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      messages: [
        { role: "user", content: "Tell me about the project architecture" },
      ],
    }, { agentId: "agent-42" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("returns undefined when no facts match", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
  });

  it("degrades gracefully when Graphiti is unreachable", async () => {
    client.searchFacts.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
  });

  it("respects maxResults config", async () => {
    client.searchFacts.mockResolvedValue([]);
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: true, maxResults: 3 },
    };

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(client.searchFacts).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      3,
    );
  });

  it("strips stop words from user message for search query", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ prompt: "Tell me about the project architecture" }, {});

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
    await handler({ prompt: "Go do it now please" }, {});

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
    await handler({ prompt: "What's the project's architecture?" }, {});

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).not.toContain("?");
    expect(query).not.toContain("'");
  });

  it("limits extracted terms to 8 words", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({
      prompt: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
    }, {});

    const query = client.searchFacts.mock.calls[0][0] as string;
    const words = query.split(" ");
    expect(words.length).toBeLessThanOrEqual(8);
  });

  it("skips search when user message yields empty query after stop-word removal", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    // All words are stop words or <= 2 chars: "is" (stop), "it" (stop), "by" (stop), "us" (stop)
    const result = await handler({ prompt: "is it by us" }, {});

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("calls setGroupId with agentId when provided (two-arg)", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(setGroupId).toHaveBeenCalledWith("agent-42");
  });

  it("calls setGroupId with agentId when provided (single-arg ctx)", async () => {
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
    await handler({ prompt: "Tell me about the project architecture" }, {});

    expect(setGroupId).not.toHaveBeenCalled();
  });
});

describe("agent_end handler", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("captures conversation to agent partition (two-arg form)", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        messages: [
          { role: "user", content: "What is the weather?" },
          { role: "assistant", content: "I don't have access to weather data." },
        ],
      },
      { agentId: "agent-42" },
    );

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "agent-42" }),
    );
  });

  it("captures conversation from single-arg ctx (gateway convention)", async () => {
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
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toContain("User: What is the weather?");
    expect(call.episode_body).toContain("Assistant: I don't have access to weather data.");
  });

  it("skips when autoCapture is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoCapture: { enabled: false },
    };

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, config);
    await handler(
      {
        messages: [
          { role: "user", content: "What is the weather?" },
          { role: "assistant", content: "Sunny." },
        ],
      },
      { agentId: "agent-42" },
    );

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips trivially short exchanges", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "hey" },
        ],
      },
      { agentId: "agent-42" },
    );

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips messages starting with /", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        messages: [
          { role: "user", content: "/status check everything" },
          { role: "assistant", content: "All systems operational and running smoothly." },
        ],
      },
      { agentId: "agent-42" },
    );

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("degrades gracefully when Graphiti is unreachable", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);

    // Should not throw
    await handler(
      {
        messages: [
          { role: "user", content: "What is the weather?" },
          { role: "assistant", content: "I don't have access to weather data." },
        ],
      },
      { agentId: "agent-42" },
    );
  });

  it("formats episode body as User/Assistant format", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        messages: [
          { role: "user", content: "What is the weather?" },
          { role: "assistant", content: "It's sunny today." },
        ],
      },
      { agentId: "agent-42" },
    );

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
    await handler(
      {
        messages: [
          { role: "user", content: "hi" },
          { role: "assistant", content: "Hello! How can I help you today?" },
        ],
      },
      { agentId: "agent-42" },
    );

    // userMsg.length < 10 but agentMsg.length >= 10 → should capture (AND condition)
    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("captures when agentResponse is short but userMessage is long", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        messages: [
          { role: "user", content: "Can you explain the architecture of this project?" },
          { role: "assistant", content: "Sure." },
        ],
      },
      { agentId: "agent-42" },
    );

    // agentMsg.length < 10 but userMsg.length >= 10 → should capture (AND condition)
    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("defaults missing messages to empty strings", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      { prompt: "This is a long enough message to pass the filter" },
      { agentId: "agent-42" },
    );

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toContain("Assistant: ");
  });

  it("falls back to 'default' group when agentId is missing", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        messages: [
          { role: "user", content: "This is a long enough message to pass the filter" },
          { role: "assistant", content: "Here is a response that is also long enough" },
        ],
      },
      {},
    );

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "default" }),
    );
  });

  it("reads user message from event.prompt as fallback", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      {
        prompt: "This is a long enough message to pass the filter",
        response: "Here is a response that is also long enough",
      },
      { agentId: "agent-42" },
    );

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toContain("User: This is a long enough message");
    expect(call.episode_body).toContain("Assistant: Here is a response");
  });
});
