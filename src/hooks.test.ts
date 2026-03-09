import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  createBeforeResetHandler,
  createSessionEndHandler,
  createGatewayStopHandler,
  flushSessionBuffer,
  extractMessagesFromCtx,
  extractUserMessageFromPrompt,
  extractLastUserMessageFromMessages,
  type HookAgentContext,
  type SessionBufferMap,
  type SessionBuffer,
} from "./hooks.js";

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

function emptySearchResults() {
  return { facts: [], nodes: [], episodes: [], communities: [] };
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

  it("strips <gralkor-memory> XML from user messages", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- The sky is blue\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What is the weather?` }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny." }] },
      ],
    });
    expect(result).toBe("User: What is the weather?\nAssistant: It's sunny.");
  });

  it("skips user message that is only <gralkor-memory> XML", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- The sky is blue\n</gralkor-memory>';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: xml }] },
        { role: "assistant", content: [{ type: "text", text: "Response" }] },
      ],
    });
    expect(result).toBe("Assistant: Response");
  });

  it("does not strip <gralkor-memory> from assistant messages", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nSome content\n</gralkor-memory>';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [{ type: "text", text: xml }] },
      ],
    });
    expect(result).toBe(`Assistant: ${xml}`);
  });

  it("strips multiple <gralkor-memory> blocks from a single user message", () => {
    const xml1 = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts block 1\n</gralkor-memory>\n';
    const xml2 = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts block 2\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml1}${xml2}Tell me more` }] },
      ],
    });
    expect(result).toBe("User: Tell me more");
  });

  it("handles <gralkor-memory> with nested newlines and special characters in facts", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- User\'s name is "John O\'Brien"\n- Project uses <React> & TypeScript\n\nEntities from knowledge graph:\n- John: A developer who works on the project\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}Hello John` }] },
      ],
    });
    expect(result).toBe("User: Hello John");
  });
});

describe("extractUserMessageFromPrompt", () => {
  it("returns empty string when prompt is missing", () => {
    expect(extractUserMessageFromPrompt({})).toBe("");
  });

  it("returns empty string for plain session startup", () => {
    expect(extractUserMessageFromPrompt({
      prompt: "A new session was started via /new",
    })).toBe("");
  });

  it("extracts user message after session startup line", () => {
    expect(extractUserMessageFromPrompt({
      prompt: "A new session was started via /new\n\nHello",
    })).toBe("Hello");
  });

  it("extracts user message with metadata after session startup line", () => {
    const prompt = 'A new session was started via /new\n\nSender (untrusted metadata):\n```json\n{"senderId": "123"}\n```\n\nHello';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("Hello");
  });

  it("returns user message from plain prompt", () => {
    expect(extractUserMessageFromPrompt({
      prompt: "Tell me about the project",
    })).toBe("Tell me about the project");
  });

  it("strips metadata wrapper and returns user message", () => {
    const prompt = 'Conversation info (untrusted metadata):\n```json\n{"key": "value"}\n```\n\nTell me about the project';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("Tell me about the project");
  });

  it("strips single System: event prefix before session startup", () => {
    const prompt = "System: [2026-02-28T12:00:00Z] Telegram reaction added: 👍\n\nA new session was started via /new";
    expect(extractUserMessageFromPrompt({ prompt })).toBe("");
  });

  it("strips System: event prefix and returns real user message", () => {
    const prompt = "System: [2026-02-28T12:00:00Z] Telegram reaction added: 👍\n\nWhat is the weather today?";
    expect(extractUserMessageFromPrompt({ prompt })).toBe("What is the weather today?");
  });

  it("strips multiple System: event lines", () => {
    const prompt = "System: [2026-02-28T12:00:00Z] Telegram reaction added: 👍\n\nSystem: [2026-02-28T12:01:00Z] Another event happened\n\nA new session was started via /new";
    expect(extractUserMessageFromPrompt({ prompt })).toBe("");
  });

  it("strips multiple System: lines before a real user message", () => {
    const prompt = "System: [2026-02-28T12:00:00Z] Telegram reaction added: 👍\n\nSystem: [2026-02-28T12:01:00Z] Another event\n\nWhat is the weather?";
    expect(extractUserMessageFromPrompt({ prompt })).toBe("What is the weather?");
  });

  it("strips System: lines + metadata wrapper before user message", () => {
    const prompt = 'System: [2026-02-28T12:00:00Z] Telegram reaction added: 👍\n\nConversation info (untrusted metadata):\n```json\n{"key": "value"}\n```\n\nTell me about the project';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("Tell me about the project");
  });

  it("strips 'Sender' metadata wrapper", () => {
    const prompt = 'Sender (untrusted metadata):\n```json\n{"senderId": "123", "senderName": "Eli"}\n```\n\nTell me about the project';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("Tell me about the project");
  });

  it("strips arbitrary label before (untrusted metadata) wrapper", () => {
    const prompt = 'Some Future Label (untrusted metadata):\n```json\n{"foo": "bar"}\n```\n\nHello world';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("Hello world");
  });

  it("strips System: lines + Sender metadata wrapper", () => {
    const prompt = 'System: [2026-02-28T12:00:00Z] Telegram reaction added: 👍\n\nSender (untrusted metadata):\n```json\n{"senderId": "123"}\n```\n\nWhat is the weather?';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("What is the weather?");
  });

  it("falls back to messages when prompt is only metadata wrapper", () => {
    const prompt = 'Sender (untrusted metadata):\n```json\n{"senderId": "123"}\n```\n\n';
    expect(extractUserMessageFromPrompt({
      prompt,
      messages: [
        { role: "user", content: [{ type: "text", text: "Any context about Cyril Rioli?" }] },
      ],
    })).toBe("Any context about Cyril Rioli?");
  });

  it("falls back to last user message from messages, skipping gralkor-memory", () => {
    const prompt = 'Sender (untrusted metadata):\n```json\n{"senderId": "123"}\n```\n\n';
    expect(extractUserMessageFromPrompt({
      prompt,
      messages: [
        { role: "user", content: [{ type: "text", text: '<gralkor-memory source="auto-recall" trust="untrusted">\nSome fact\n</gralkor-memory>\n\nFirst question' }] },
        { role: "assistant", content: [{ type: "text", text: "Reply" }] },
        { role: "user", content: [{ type: "text", text: '<gralkor-memory source="auto-recall" trust="untrusted">\nAnother fact\n</gralkor-memory>\n\nSecond question' }] },
      ],
    })).toBe("Second question");
  });

  it("returns empty when prompt is only metadata and no messages", () => {
    const prompt = 'Sender (untrusted metadata):\n```json\n{"senderId": "123"}\n```\n\n';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("");
  });
});

describe("extractLastUserMessageFromMessages", () => {
  it("returns empty when no messages", () => {
    expect(extractLastUserMessageFromMessages({})).toBe("");
  });

  it("returns last user message text", () => {
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: [{ type: "text", text: "First" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply" }] },
        { role: "user", content: [{ type: "text", text: "Second" }] },
      ],
    })).toBe("Second");
  });

  it("strips gralkor-memory blocks", () => {
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: [{ type: "text", text: '<gralkor-memory source="auto-recall" trust="untrusted">\nFact\n</gralkor-memory>\n\nActual question' }] },
      ],
    })).toBe("Actual question");
  });

  it("skips user messages that are only gralkor-memory", () => {
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: [{ type: "text", text: "Real message" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply" }] },
        { role: "user", content: [{ type: "text", text: '<gralkor-memory source="auto-recall" trust="untrusted">\nOnly memory\n</gralkor-memory>' }] },
      ],
    })).toBe("Real message");
  });
});

describe("before_agent_start handler", () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    client = mockClient();
  });

  it("returns context with matching facts", async () => {
    client.search.mockResolvedValue({
      ...emptySearchResults(),
      facts: [makeFact({ group_id: "agent-42", fact: "Project uses microservices" })],
    });

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
    expect(ctx_result).toContain("Facts from knowledge graph:");
  });

  it("includes native memory results when getNativeSearch is provided", async () => {
    client.search.mockResolvedValue(emptySearchResults());
    const nativeSearch = vi.fn().mockResolvedValue("Native result: project notes");
    const getNativeSearch = () => nativeSearch;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
    );

    expect(result).toHaveProperty("prependContext");
    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("From native memory:");
    expect(ctx_result).toContain("Native result: project notes");
    expect(nativeSearch).toHaveBeenCalled();
  });

  it("combines facts and native results", async () => {
    client.search.mockResolvedValue({ ...emptySearchResults(), facts: [makeFact({ fact: "A fact" })] });
    const nativeSearch = vi.fn().mockResolvedValue("Native data");
    const getNativeSearch = () => nativeSearch;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
    );

    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Facts from knowledge graph:");
    expect(ctx_result).toContain("From native memory:");
  });

  it("skips native results when getNativeSearch returns null", async () => {
    client.search.mockResolvedValue({ ...emptySearchResults(), facts: [makeFact({ fact: "A fact" })] });
    const getNativeSearch = () => null;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
    );

    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Facts from knowledge graph:");
    expect(ctx_result).not.toContain("From native memory:");
  });

  it("degrades gracefully when native search fails", async () => {
    client.search.mockResolvedValue({ ...emptySearchResults(), facts: [makeFact({ fact: "A fact" })] });
    const nativeSearch = vi.fn().mockRejectedValue(new Error("native error"));
    const getNativeSearch = () => nativeSearch;

    const handler = createBeforeAgentStartHandler(
      client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch,
    );
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
    );

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
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
    expect(client.search).not.toHaveBeenCalled();
  });

  it("skips when no user message in context", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({}, { agentId: "agent-42" });

    expect(result).toBeUndefined();
    expect(client.search).not.toHaveBeenCalled();
  });

  it("searches using key terms from user message", async () => {
    client.search.mockResolvedValue(emptySearchResults());

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    const query = client.search.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("returns undefined when no results from any source", async () => {
    client.search.mockResolvedValue(emptySearchResults());

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
  });

  it("degrades silently when Graphiti is unreachable", async () => {
    client.search.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
  });

  it("respects maxResults config", async () => {
    client.search.mockResolvedValue(emptySearchResults());
    const config: GralkorConfig = {
      ...defaultConfig,
      autoRecall: { enabled: true, maxResults: 3 },
    };

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(client.search).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      3,
    );
  });

  it("passes full user message as search query", async () => {
    client.search.mockResolvedValue(emptySearchResults());

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    const query = client.search.mock.calls[0][0] as string;
    expect(query).toBe("Tell me about the project architecture");
  });

  it("calls setGroupId with agentId when provided", async () => {
    client.search.mockResolvedValue(emptySearchResults());
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(setGroupId).toHaveBeenCalledWith("agent-42");
  });

  it("does not call setGroupId when agentId is missing", async () => {
    client.search.mockResolvedValue(emptySearchResults());
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler({ prompt: "Tell me about the project architecture" });

    expect(setGroupId).not.toHaveBeenCalled();
  });
});

describe("agent_end handler", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
    vi.useFakeTimers();
  });

  afterEach(() => {
    buffers.clear();
    vi.useRealTimers();
  });

  it("buffers messages and flushes on idle timeout", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
      ],
    });

    // Not flushed yet
    expect(client.addEpisode).not.toHaveBeenCalled();
    expect(buffers.size).toBe(1);

    // Flush via flushSessionBuffer
    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toBe("User: What is the weather?\nAssistant: I don't have access to weather data.");
  });

  it("captures multi-turn conversations on flush", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny." }] },
        { role: "user", content: [{ type: "text", text: "And tomorrow?" }] },
        { role: "assistant", content: [{ type: "text", text: "Rain expected." }] },
      ],
    });

    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toBe(
      "User: What is the weather?\nAssistant: It's sunny.\nUser: And tomorrow?\nAssistant: Rain expected.",
    );
  });

  it("uses agent's group_id partition", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
          { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
        ],
      },
      { agentId: "agent-42" },
    );

    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "agent-42" }),
    );
  });

  it("skips when autoCapture is disabled", async () => {
    const config: GralkorConfig = {
      ...defaultConfig,
      autoCapture: { enabled: false },
    };

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, config, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "Sunny." }] },
      ],
    });

    expect(buffers.size).toBe(0);
    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips when no messages", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [],
    });

    expect(buffers.size).toBe(0);
    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("skips slash commands on flush", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "/status check everything" }] },
        { role: "assistant", content: [{ type: "text", text: "All systems operational and running smoothly." }] },
      ],
    });

    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("propagates errors when Graphiti is unreachable on flush", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
      ],
    });

    const [key, buffer] = [...buffers.entries()][0];
    await expect(
      flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient),
    ).rejects.toThrow("ECONNREFUSED");
  });

  it("formats episode body with auto-capture metadata on flush", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny today." }] },
      ],
    });

    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    const call = client.addEpisode.mock.calls[0][0] as {
      episode_body: string;
      source_description: string;
      name: string;
    };
    expect(call.episode_body).toBe("User: What is the weather?\nAssistant: It's sunny today.");
    expect(call.source_description).toBe("auto-capture");
    expect(call.name).toMatch(/^conversation-\d+$/);
  });

  it("strips <gralkor-memory> XML from user messages before storing", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- The sky is blue\n</gralkor-memory>\n';
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What is the weather?` }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny." }] },
      ],
    });

    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toBe("User: What is the weather?\nAssistant: It's sunny.");
    expect(call.episode_body).not.toContain("gralkor-memory");
  });

  it("falls back to 'default' group when agentId is missing", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "This is a long enough message to pass the filter" }] },
        { role: "assistant", content: [{ type: "text", text: "Here is a response that is also long enough" }] },
      ],
    });

    const [key, buffer] = [...buffers.entries()][0];
    await flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: "default" }),
    );
  });

  it("replaces buffer on subsequent agent_end calls (not append)", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);

    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "First question" }] },
        { role: "assistant", content: [{ type: "text", text: "First answer" }] },
      ],
    });

    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: "First question" }] },
        { role: "assistant", content: [{ type: "text", text: "First answer" }] },
        { role: "user", content: [{ type: "text", text: "Second question" }] },
        { role: "assistant", content: [{ type: "text", text: "Second answer" }] },
      ],
    });

    expect(buffers.size).toBe(1);
    const buffer = buffers.values().next().value!;
    expect(buffer.messages).toHaveLength(4);
    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("uses sessionKey as buffer key when available", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
          { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        ],
      },
      { agentId: "agent-42", sessionKey: "session-abc" },
    );

    expect(buffers.has("session-abc")).toBe(true);
    expect(buffers.has("agent-42")).toBe(false);
  });

  it("uses agentId as buffer key when sessionKey is absent", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: "Hello" }] },
          { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        ],
      },
      { agentId: "agent-42" },
    );

    expect(buffers.has("agent-42")).toBe(true);
  });

  it("separates buffers for different sessions", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);

    await handler(
      { messages: [{ role: "user", content: [{ type: "text", text: "Session 1" }] }] },
      { sessionKey: "session-1" },
    );
    await handler(
      { messages: [{ role: "user", content: [{ type: "text", text: "Session 2" }] }] },
      { sessionKey: "session-2" },
    );

    expect(buffers.size).toBe(2);
  });
});

describe("session lifecycle (agent_end → boundary flush)", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    vi.useFakeTimers();
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  afterEach(() => {
    buffers.clear();
    vi.useRealTimers();
  });

  it("3 turns then /new → single episode with full conversation", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const beforeReset = createBeforeResetHandler(client as unknown as GraphitiClient, buffers);
    const ctx = { agentId: "agent-1", sessionKey: "sess-1" };

    // Turn 1: agent_end delivers full session history (1 exchange)
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "What's my name?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know yet." }] },
      ],
    }, ctx);

    // Turn 2: agent_end delivers full session history (2 exchanges)
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "What's my name?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know yet." }] },
        { role: "user", content: [{ type: "text", text: "My name is Eli." }] },
        { role: "assistant", content: [{ type: "text", text: "Nice to meet you, Eli!" }] },
      ],
    }, ctx);

    // Turn 3: agent_end delivers full session history (3 exchanges)
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "What's my name?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know yet." }] },
        { role: "user", content: [{ type: "text", text: "My name is Eli." }] },
        { role: "assistant", content: [{ type: "text", text: "Nice to meet you, Eli!" }] },
        { role: "user", content: [{ type: "text", text: "Remember that." }] },
        { role: "assistant", content: [{ type: "text", text: "I'll remember your name is Eli." }] },
      ],
    }, ctx);

    // No episodes created yet
    expect(client.addEpisode).not.toHaveBeenCalled();

    // User types /new → before_reset fires
    await beforeReset({}, ctx);

    // Exactly 1 episode with all 3 turns
    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).toBe(
      "User: What's my name?\n" +
      "Assistant: I don't know yet.\n" +
      "User: My name is Eli.\n" +
      "Assistant: Nice to meet you, Eli!\n" +
      "User: Remember that.\n" +
      "Assistant: I'll remember your name is Eli.",
    );
    expect(buffers.size).toBe(0);
  });

  it("3 turns then session_end → single episode", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, buffers);
    const agentCtx = { agentId: "agent-1", sessionKey: "sess-1" };
    const sessionCtx = { agentId: "agent-1", sessionId: "sid-1", sessionKey: "sess-1" };

    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
    }, agentCtx);

    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
        { role: "user", content: [{ type: "text", text: "Bye" }] },
        { role: "assistant", content: [{ type: "text", text: "Goodbye!" }] },
      ],
    }, agentCtx);

    expect(client.addEpisode).not.toHaveBeenCalled();

    // New session starts → previous session ends
    await sessionEnd({}, sessionCtx);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).toContain("Hello");
    expect(body).toContain("Bye");
    expect(body).toContain("Goodbye!");
    expect(buffers.size).toBe(0);
  });

  it("two concurrent sessions flush independently", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const beforeReset = createBeforeResetHandler(client as unknown as GraphitiClient, buffers);

    const ctx1 = { agentId: "agent-1", sessionKey: "sess-1" };
    const ctx2 = { agentId: "agent-1", sessionKey: "sess-2" };

    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "Session 1 message" }] },
        { role: "assistant", content: [{ type: "text", text: "Session 1 reply" }] },
      ],
    }, ctx1);

    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "Session 2 message" }] },
        { role: "assistant", content: [{ type: "text", text: "Session 2 reply" }] },
      ],
    }, ctx2);

    expect(buffers.size).toBe(2);

    // Reset session 1 only
    await beforeReset({}, ctx1);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body1 = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body1).toContain("Session 1");
    expect(buffers.size).toBe(1);
    expect(buffers.has("sess-2")).toBe(true);

    // Reset session 2
    await beforeReset({}, ctx2);

    expect(client.addEpisode).toHaveBeenCalledTimes(2);
    const body2 = (client.addEpisode.mock.calls[1][0] as { episode_body: string }).episode_body;
    expect(body2).toContain("Session 2");
    expect(buffers.size).toBe(0);
  });

  it("gateway_stop flushes all active sessions", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const gatewayStop = createGatewayStopHandler(client as unknown as GraphitiClient, buffers);

    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "Sess A" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply A" }] },
      ],
    }, { sessionKey: "sess-a" });

    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "Sess B" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply B" }] },
      ],
    }, { sessionKey: "sess-b" });

    expect(client.addEpisode).not.toHaveBeenCalled();

    await gatewayStop();

    expect(client.addEpisode).toHaveBeenCalledTimes(2);
    expect(buffers.size).toBe(0);
  });

  it("strips gralkor-memory XML across accumulated turns", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const beforeReset = createBeforeResetHandler(client as unknown as GraphitiClient, buffers);
    const ctx = { agentId: "agent-1", sessionKey: "sess-1" };
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts:\n- Name is Eli\n</gralkor-memory>\n';

    // Turn 1: has injected memory context
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What's my name?` }] },
        { role: "assistant", content: [{ type: "text", text: "Your name is Eli." }] },
      ],
    }, ctx);

    // Turn 2: also has injected memory context
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What's my name?` }] },
        { role: "assistant", content: [{ type: "text", text: "Your name is Eli." }] },
        { role: "user", content: [{ type: "text", text: `${xml}And my last name?` }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know your last name." }] },
      ],
    }, ctx);

    await beforeReset({}, ctx);

    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).not.toContain("gralkor-memory");
    expect(body).toBe(
      "User: What's my name?\n" +
      "Assistant: Your name is Eli.\n" +
      "User: And my last name?\n" +
      "Assistant: I don't know your last name.",
    );
  });
});

describe("flushSessionBuffer", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  it("flushes buffer and removes it from the map", async () => {
    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episode_body: "User: Hello\nAssistant: Hi",
        source_description: "auto-capture",
        group_id: "agent-42",
      }),
    );
    expect(buffers.size).toBe(0);
  });

  it("skips flush when extracted conversation is empty", async () => {
    const buffer: SessionBuffer = {
      messages: [],
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).not.toHaveBeenCalled();
    expect(buffers.size).toBe(0);
  });

  it("skips flush when first user message is a slash command", async () => {
    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "/status check" }] },
        { role: "assistant", content: [{ type: "text", text: "All good." }] },
      ],
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).not.toHaveBeenCalled();
    expect(buffers.size).toBe(0);
  });

});

describe("before_reset handler", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  it("flushes buffer for the session being reset", async () => {
    buffers.set("session-abc", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Important conversation" }] },
        { role: "assistant", content: [{ type: "text", text: "Noted." }] },
      ],
      agentId: "agent-42",
      sessionKey: "session-abc",
    });

    const handler = createBeforeResetHandler(client as unknown as GraphitiClient, buffers);
    await handler({}, { sessionKey: "session-abc" });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episode_body: "User: Important conversation\nAssistant: Noted.",
        group_id: "agent-42",
      }),
    );
    expect(buffers.size).toBe(0);
  });

  it("does nothing when no buffer exists for the session", async () => {
    const handler = createBeforeResetHandler(client as unknown as GraphitiClient, buffers);
    await handler({}, { sessionKey: "nonexistent" });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("does not affect other session buffers", async () => {
    buffers.set("session-1", {
      messages: [{ role: "user", content: [{ type: "text", text: "Session 1" }] }],
      sessionKey: "session-1",
    });
    buffers.set("session-2", {
      messages: [{ role: "user", content: [{ type: "text", text: "Session 2" }] }],
      sessionKey: "session-2",
    });

    const handler = createBeforeResetHandler(client as unknown as GraphitiClient, buffers);
    await handler({}, { sessionKey: "session-1" });

    expect(buffers.size).toBe(1);
    expect(buffers.has("session-2")).toBe(true);

  });
});

describe("session_end handler", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  it("flushes buffer for the ended session", async () => {
    buffers.set("session-abc", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Conversation" }] },
        { role: "assistant", content: [{ type: "text", text: "Response" }] },
      ],
      agentId: "agent-42",
      sessionKey: "session-abc",
    });

    const handler = createSessionEndHandler(client as unknown as GraphitiClient, buffers);
    await handler({}, { sessionId: "sid-1", sessionKey: "session-abc" });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(buffers.size).toBe(0);
  });

  it("does nothing when no buffer exists", async () => {
    const handler = createSessionEndHandler(client as unknown as GraphitiClient, buffers);
    await handler({}, { sessionId: "sid-1", sessionKey: "nonexistent" });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });
});

describe("gateway_stop handler", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  it("flushes all buffers", async () => {
    buffers.set("session-1", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Session 1 msg" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply 1" }] },
      ],
      agentId: "agent-1",
    });
    buffers.set("session-2", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Session 2 msg" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply 2" }] },
      ],
      agentId: "agent-2",
    });

    const handler = createGatewayStopHandler(client as unknown as GraphitiClient, buffers);
    await handler();

    expect(client.addEpisode).toHaveBeenCalledTimes(2);
    expect(buffers.size).toBe(0);
  });

  it("does nothing when no buffers exist", async () => {
    const handler = createGatewayStopHandler(client as unknown as GraphitiClient, buffers);
    await handler();

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("continues flushing other buffers when one fails", async () => {
    client.addEpisode
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({});

    buffers.set("session-1", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Session 1" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply 1" }] },
      ],
      agentId: "agent-1",
    });
    buffers.set("session-2", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Session 2" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply 2" }] },
      ],
      agentId: "agent-2",
    });

    const handler = createGatewayStopHandler(client as unknown as GraphitiClient, buffers);
    await handler();

    expect(client.addEpisode).toHaveBeenCalledTimes(2);
    expect(buffers.size).toBe(0);
  });
});
