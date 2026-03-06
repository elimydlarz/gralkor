import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { defaultConfig } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  extractMessagesFromCtx,
  extractUserMessageFromPrompt,
  extractLastUserMessageFromMessages,
  extractTimestamp,
  type HookAgentContext,
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

describe("extractTimestamp", () => {
  it("parses and strips valid timestamp prefix", () => {
    const result = extractTimestamp("[timestamp: 2023-05-08T13:56:00] Hello");
    expect(result.timestamp).toBe("2023-05-08T13:56:00");
    expect(result.stripped).toBe("Hello");
  });

  it("returns null and original text when no timestamp prefix", () => {
    const result = extractTimestamp("Just a normal message");
    expect(result.timestamp).toBeNull();
    expect(result.stripped).toBe("Just a normal message");
  });

  it("does not match timestamp in the middle of text", () => {
    const result = extractTimestamp("Some text [timestamp: 2023-05-08T13:56:00] more");
    expect(result.timestamp).toBeNull();
    expect(result.stripped).toBe("Some text [timestamp: 2023-05-08T13:56:00] more");
  });

  it("handles timestamp with no trailing text", () => {
    const result = extractTimestamp("[timestamp: 2023-05-08T13:56:00] ");
    expect(result.timestamp).toBe("2023-05-08T13:56:00");
    expect(result.stripped).toBe("");
  });
});

describe("extractMessagesFromCtx", () => {
  it("returns empty string when no messages", () => {
    expect(extractMessagesFromCtx({}).text).toBe("");
    expect(extractMessagesFromCtx({ messages: [] }).text).toBe("");
  });

  it("extracts a single user+assistant exchange", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
      ],
    });
    expect(result.text).toBe("User: Hello\nAssistant: Hi there");
    expect(result.firstTimestamp).toBeNull();
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
    expect(result.text).toBe(
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
    expect(result.text).toBe("User: Hello\nAssistant: Done");
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
    expect(result.text).toBe("User: Part 1\nPart 2");
  });

  it("strips <gralkor-memory> XML from user messages", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- The sky is blue\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What is the weather?` }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny." }] },
      ],
    });
    expect(result.text).toBe("User: What is the weather?\nAssistant: It's sunny.");
  });

  it("skips user message that is only <gralkor-memory> XML", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- The sky is blue\n</gralkor-memory>';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: xml }] },
        { role: "assistant", content: [{ type: "text", text: "Response" }] },
      ],
    });
    expect(result.text).toBe("Assistant: Response");
  });

  it("does not strip <gralkor-memory> from assistant messages", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nSome content\n</gralkor-memory>';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [{ type: "text", text: xml }] },
      ],
    });
    expect(result.text).toBe(`Assistant: ${xml}`);
  });

  it("strips multiple <gralkor-memory> blocks from a single user message", () => {
    const xml1 = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts block 1\n</gralkor-memory>\n';
    const xml2 = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts block 2\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml1}${xml2}Tell me more` }] },
      ],
    });
    expect(result.text).toBe("User: Tell me more");
  });

  it("handles <gralkor-memory> with nested newlines and special characters in facts", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- User\'s name is "John O\'Brien"\n- Project uses <React> & TypeScript\n\nEntities from knowledge graph:\n- John: A developer who works on the project\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}Hello John` }] },
      ],
    });
    expect(result.text).toBe("User: Hello John");
  });

  it("strips timestamp from user messages and returns firstTimestamp", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "[timestamp: 2023-05-08T13:56:00] What happened yesterday?" }] },
        { role: "assistant", content: [{ type: "text", text: "You had a meeting." }] },
      ],
    });
    expect(result.text).toBe("User: What happened yesterday?\nAssistant: You had a meeting.");
    expect(result.firstTimestamp).toBe("2023-05-08T13:56:00");
  });

  it("returns first timestamp from multi-turn with timestamps", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "[timestamp: 2023-05-08T13:56:00] First question" }] },
        { role: "assistant", content: [{ type: "text", text: "First answer" }] },
        { role: "user", content: [{ type: "text", text: "[timestamp: 2023-05-08T14:30:00] Second question" }] },
        { role: "assistant", content: [{ type: "text", text: "Second answer" }] },
      ],
    });
    expect(result.text).toBe("User: First question\nAssistant: First answer\nUser: Second question\nAssistant: Second answer");
    expect(result.firstTimestamp).toBe("2023-05-08T13:56:00");
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

  it("strips timestamp prefix from user message", () => {
    expect(extractUserMessageFromPrompt({
      prompt: "[timestamp: 2023-05-08T13:56:00] Tell me about the project",
    })).toBe("Tell me about the project");
  });

  it("strips timestamp after metadata wrapper", () => {
    const prompt = 'Sender (untrusted metadata):\n```json\n{"senderId": "123"}\n```\n\n[timestamp: 2023-05-08T13:56:00] Tell me about the project';
    expect(extractUserMessageFromPrompt({ prompt })).toBe("Tell me about the project");
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

  it("strips timestamp prefix from last user message", () => {
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: [{ type: "text", text: "[timestamp: 2023-05-08T13:56:00] What happened?" }] },
      ],
    })).toBe("What happened?");
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
    expect(ctx_result).toContain("Facts from knowledge graph:");
  });

  it("includes native memory results when getNativeSearch is provided", async () => {
    client.searchFacts.mockResolvedValue([]);
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
    client.searchFacts.mockResolvedValue([makeFact({ fact: "A fact" })]);
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
    client.searchFacts.mockResolvedValue([makeFact({ fact: "A fact" })]);
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
    client.searchFacts.mockResolvedValue([makeFact({ fact: "A fact" })]);
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
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("skips when no user message in context", async () => {
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler({}, { agentId: "agent-42" });

    expect(result).toBeUndefined();
    expect(client.searchFacts).not.toHaveBeenCalled();
  });

  it("searches using key terms from user message", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toContain("project");
    expect(query).toContain("architecture");
  });

  it("returns undefined when no results from any source", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(result).toBeUndefined();
  });

  it("degrades silently when Graphiti is unreachable", async () => {
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

  it("passes full user message as search query", async () => {
    client.searchFacts.mockResolvedValue([]);

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    const query = client.searchFacts.mock.calls[0][0] as string;
    expect(query).toBe("Tell me about the project architecture");
  });

  it("calls setGroupId with agentId when provided", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler(
      { prompt: "Tell me about the project architecture" },
      { agentId: "agent-42" },
    );

    expect(setGroupId).toHaveBeenCalledWith("agent-42");
  });

  it("does not call setGroupId when agentId is missing", async () => {
    client.searchFacts.mockResolvedValue([]);
    const setGroupId = vi.fn();

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig, setGroupId);
    await handler({ prompt: "Tell me about the project architecture" });

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
    await handler(
      {
        messages: [
          { role: "user", content: [{ type: "text", text: "What is the weather?" }] },
          { role: "assistant", content: [{ type: "text", text: "I don't have access to weather data." }] },
        ],
      },
      { agentId: "agent-42" },
    );

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

  it("strips <gralkor-memory> XML from user messages before storing", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig);
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts from knowledge graph:\n- The sky is blue\n</gralkor-memory>\n';
    await handler({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What is the weather?` }] },
        { role: "assistant", content: [{ type: "text", text: "It's sunny." }] },
      ],
    });

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const call = client.addEpisode.mock.calls[0][0] as { episode_body: string };
    expect(call.episode_body).toBe("User: What is the weather?\nAssistant: It's sunny.");
    expect(call.episode_body).not.toContain("gralkor-memory");
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
