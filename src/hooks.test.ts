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

  it("returns context with matching facts", async () => {
    client.searchFacts.mockResolvedValue([
      makeFact({ group_id: "agent-42", fact: "Project uses microservices" }),
    ]);

    const hook = createBeforeAgentStartHook(client as unknown as GraphitiClient, defaultConfig);
    const result = await hook.execute(ctx);

    expect(result).toHaveProperty("context");
    expect(result!.context).toContain("Project uses microservices");
    expect(result!.context).toContain("gralkor-memory");
    expect(result!.context).toContain('trust="untrusted"');
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
});
