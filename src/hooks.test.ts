import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import { createBeforeAgentStartHook, createAgentEndHook } from "./hooks.js";

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

const ctx = { agentId: "agent-42", userMessage: "Tell me about the project architecture" };

describe("before_agent_start hook", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  it("has the correct hook shape", () => {
    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    expect(hook.name).toBe("before_agent_start");
    expect(typeof hook.execute).toBe("function");
  });

  it("returns context with matching facts and graph label", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "Project uses microservices" }),
    ]);

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    const result = await hook.execute(ctx);

    expect(result).toHaveProperty("context");
    expect(result!.context).toContain("Project uses microservices");
    expect(result!.context).toContain("gralkor-memory");
    expect(result!.context).toContain('trust="untrusted"');
    expect(result!.context).toContain("Relevant facts from knowledge graph:");
  });

  it("skips when autoRecall is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: false, maxResults: 5 },
    };

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, config);
    const result = await hook.execute(ctx);

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("skips when no userMessage", async () => {
    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    const result = await hook.execute({ agentId: "agent-42" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("returns undefined when no facts match", async () => {
    client.searchFacts.mockResolvedValue([]);

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    const result = await hook.execute(ctx);

    expect(result).toBeUndefined();
  });

  it("degrades silently when Graphiti is unreachable", async () => {
    client.searchFacts.mockRejectedValue(new Error("ECONNREFUSED"));

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    const result = await hook.execute(ctx);

    expect(result).toBeUndefined();
  });

  it("respects maxResults config", async () => {
    client.searchFacts.mockResolvedValue([]);
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: true, maxResults: 3 },
    };

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, config);
    await hook.execute(ctx);

    expect(client.searchFacts).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      3,
    );
  });

  it("strips stop words from user message for search query", async () => {
    client.searchFacts.mockResolvedValue([]);

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({ agentId: "agent-42", userMessage: "Tell me about the project architecture" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).not.toContain("the");
    expect(query).not.toContain("about");
    expect(query).toContain("tell");
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("filters words shorter than 3 characters", async () => {
    client.searchFacts.mockResolvedValue([]);

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({ agentId: "agent-42", userMessage: "Go do it now please" });

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

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({ agentId: "agent-42", userMessage: "What's the project's architecture?" });

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).not.toContain("?");
    expect(query).not.toContain("'");
  });

  it("limits extracted terms to 8 words", async () => {
    client.searchFacts.mockResolvedValue([]);

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima",
    });

    const query = client.searchFacts.mock.calls[0][0] as string;
    const words = query.split(" ");
    expect(words.length).toBeLessThanOrEqual(8);
  });

  it("skips search when user message yields empty query after stop-word removal", async () => {
    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    // All words are stop words or <= 2 chars: "is" (stop), "it" (stop), "by" (stop), "us" (stop)
    const result = await hook.execute({ agentId: "agent-42", userMessage: "is it by us" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("calls setGroupId with agentId when provided", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await hook.execute({ agentId: "agent-42", userMessage: "Tell me about the project" });

    expect(setGroupId).toHaveBeenCalledWith("agent-42");
  });

  it("does not call setGroupId when agentId is missing", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await hook.execute({ userMessage: "Tell me about the project" });

    expect(setGroupId).not.toHaveBeenCalled();
  });
});

describe("agent_end hook", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
  });

  it("has the correct hook shape", () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    expect(hook.name).toBe("agent_end");
    expect(typeof hook.execute).toBe("function");
  });

  it("captures conversation to agent partition", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "What is the weather?",
      agentResponse: "I don't have access to weather data.",
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

    const hook = createAgentEndHook(client as unknown as GraphitiClient, config);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "What is the weather?",
      agentResponse: "Sunny.",
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips trivially short exchanges", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "hi",
      agentResponse: "hey",
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips messages starting with /", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "/status check everything",
      agentResponse: "All systems operational and running smoothly.",
    });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("degrades silently when Graphiti is unreachable", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);

    // Should not throw
    await hook.execute({
      agentId: "agent-42",
      userMessage: "What is the weather?",
      agentResponse: "I don't have access to weather data.",
    });
  });

  it("formats episode body as User/Assistant format", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "What is the weather?",
      agentResponse: "It's sunny today.",
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
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "hi",
      agentResponse: "Hello! How can I help you today?",
    });

    // userMsg.length < 10 but agentMsg.length >= 10 → should capture (AND condition)
    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("captures when agentResponse is short but userMessage is long", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "Can you explain the architecture of this project?",
      agentResponse: "Sure.",
    });

    // agentMsg.length < 10 but userMsg.length >= 10 → should capture (AND condition)
    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("defaults missing agentResponse to empty string", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      agentId: "agent-42",
      userMessage: "This is a long enough message to pass the filter",
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toContain("Assistant: ");
  });

  it("falls back to 'default' group when agentId is missing", async () => {
    const hook = createAgentEndHook(client as unknown as GraphitiClient, defaultConfig);
    await hook.execute({
      userMessage: "This is a long enough message to pass the filter",
      agentResponse: "Here is a response that is also long enough",
    });

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "default" }),
    );
  });
});
