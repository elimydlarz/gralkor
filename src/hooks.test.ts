import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig, ReadyGate } from "./config.js";
import { defaultConfig, createReadyGate } from "./config.js";
import {
  createBeforeAgentStartHandler,
  createAgentEndHandler,
  createSessionEndHandler,
  flushSessionBuffer,
  extractMessagesFromCtx,
  extractUserMessageFromPrompt,
  extractLastUserMessageFromMessages,
  clearIdleTimers,
  type HookAgentContext,
  type SessionBufferMap,
  type SessionBuffer,
  type IdleTimerMap,
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
    expired_at: null,
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

  it("handles string content in user messages", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: "Hello from string" },
        { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
      ],
    });
    expect(result).toBe("User: Hello from string\nAssistant: Hi there");
  });

  it("strips <gralkor-memory> from string content in user messages", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts\n</gralkor-memory>\n';
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: `${xml}What is the weather?` },
        { role: "assistant", content: [{ type: "text", text: "Sunny." }] },
      ],
    });
    expect(result).toBe("User: What is the weather?\nAssistant: Sunny.");
  });

  it("extracts output_text blocks alongside text blocks", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [
          { type: "text", text: "Part 1" },
          { type: "output_text", text: "Part 2" },
        ]},
      ],
    });
    expect(result).toBe("User: Hello\nAssistant: Part 1\nAssistant: Part 2");
  });

  it("extracts messages with only output_text blocks", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "output_text", text: "Response via output_text" }] },
      ],
    });
    expect(result).toBe("User: Hello\nAssistant: Response via output_text");
  });

  it("emits thinking block as Assistant: (thinking: ...)", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [
          { type: "thinking", thinking: "I should greet the user" },
          { type: "text", text: "Hi there!" },
        ]},
      ],
    });
    expect(result).toBe(
      "User: Hello\nAssistant: (thinking: I should greet the user)\nAssistant: Hi there!",
    );
  });

  it("preserves order of interleaved thinking and text blocks", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [
          { type: "thinking", thinking: "First thought" },
          { type: "text", text: "First response" },
          { type: "thinking", thinking: "Second thought" },
          { type: "text", text: "Second response" },
        ]},
      ],
    });
    expect(result).toBe(
      "Assistant: (thinking: First thought)\nAssistant: First response\nAssistant: (thinking: Second thought)\nAssistant: Second response",
    );
  });

  it("truncates thinking block at maxThinkingChars with ...", () => {
    const longThinking = "A".repeat(3000);
    const result = extractMessagesFromCtx(
      {
        messages: [
          { role: "assistant", content: [
            { type: "thinking", thinking: longThinking },
            { type: "text", text: "Done" },
          ]},
        ],
      },
      { maxThinkingChars: 100 },
    );
    expect(result).toBe(
      `Assistant: (thinking: ${"A".repeat(100)}...)\nAssistant: Done`,
    );
  });

  it("uses default maxThinkingChars of 2000", () => {
    const longThinking = "B".repeat(2500);
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [
          { type: "thinking", thinking: longThinking },
        ]},
      ],
    });
    expect(result).toBe(
      `Assistant: (thinking: ${"B".repeat(2000)}...)`,
    );
  });

  it("does not truncate thinking block shorter than maxThinkingChars", () => {
    const result = extractMessagesFromCtx(
      {
        messages: [
          { role: "assistant", content: [
            { type: "thinking", thinking: "short thought" },
          ]},
        ],
      },
      { maxThinkingChars: 100 },
    );
    expect(result).toBe("Assistant: (thinking: short thought)");
  });

  it("skips thinking block with no thinking field", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [
          { type: "thinking" },
          { type: "text", text: "Hello" },
        ]},
      ],
    });
    expect(result).toBe("Assistant: Hello");
  });

  it("skips thinking block with empty thinking field", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [
          { type: "thinking", thinking: "" },
          { type: "text", text: "Hello" },
        ]},
      ],
    });
    expect(result).toBe("Assistant: Hello");
  });

  it("emits thinking and text but skips toolCall in mixed message", () => {
    const result = extractMessagesFromCtx({
      messages: [
        { role: "assistant", content: [
          { type: "thinking", thinking: "I should check auth.ts" },
          { type: "text", text: "Let me look at the auth module." },
          { type: "toolCall", name: "Read", input: { path: "auth.ts" } },
          { type: "text", text: "Found the bug on line 42." },
        ]},
      ],
    });
    expect(result).toBe(
      "Assistant: (thinking: I should check auth.ts)\nAssistant: Let me look at the auth module.\nAssistant: Found the bug on line 42.",
    );
  });

  describe("when user message is a session-start instruction", () => {
    it("then skips the message", () => {
      const sessionStart = "A new session was started via /new or /reset. Execute your Session Startup sequence now - read the required files before responding to the user. Then greet the user in your configured persona, if one is provided.\nCurrent time: Friday, March 13th, 2026 — 12:01 PM (UTC) / 2026-03-13 12:01 UTC";
      const result = extractMessagesFromCtx({
        messages: [
          { role: "user", content: [{ type: "text", text: sessionStart }] },
          { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
          { role: "user", content: [{ type: "text", text: "Hey there" }] },
          { role: "assistant", content: [{ type: "text", text: "What's up?" }] },
        ],
      });
      expect(result).toBe("Assistant: Hello!\nUser: Hey there\nAssistant: What's up?");
    });

    it("then skips even with string content", () => {
      const result = extractMessagesFromCtx({
        messages: [
          { role: "user", content: "A new session was started via /new" },
          { role: "assistant", content: [{ type: "text", text: "Hello!" }] },
        ],
      });
      expect(result).toBe("Assistant: Hello!");
    });
  });

  describe("when user message contains metadata wrappers", () => {
    it("then strips a single metadata block and keeps the user text", () => {
      const msg = 'Sender (untrusted metadata):\n```json\n{"id": "123", "name": "Eli"}\n```\n\nHey, enjoying tmux?';
      const result = extractMessagesFromCtx({
        messages: [
          { role: "user", content: [{ type: "text", text: msg }] },
          { role: "assistant", content: [{ type: "text", text: "Sure am!" }] },
        ],
      });
      expect(result).toBe("User: Hey, enjoying tmux?\nAssistant: Sure am!");
    });

    it("then strips multiple metadata blocks and keeps the user text", () => {
      const msg = 'Conversation info (untrusted metadata):\n```json\n{"message_id": "1293", "sender": "Eli"}\n```\n\nSender (untrusted metadata):\n```json\n{"id": "123", "name": "Eli"}\n```\n\nHey, enjoying tmux?';
      const result = extractMessagesFromCtx({
        messages: [
          { role: "user", content: [{ type: "text", text: msg }] },
          { role: "assistant", content: [{ type: "text", text: "Sure am!" }] },
        ],
      });
      expect(result).toBe("User: Hey, enjoying tmux?\nAssistant: Sure am!");
    });

    it("then skips user message when only metadata remains", () => {
      const msg = 'Sender (untrusted metadata):\n```json\n{"id": "123"}\n```\n\n';
      const result = extractMessagesFromCtx({
        messages: [
          { role: "user", content: [{ type: "text", text: msg }] },
          { role: "assistant", content: [{ type: "text", text: "Response" }] },
        ],
      });
      expect(result).toBe("Assistant: Response");
    });

    it("then strips metadata from string content too", () => {
      const msg = 'Sender (untrusted metadata):\n```json\n{"id": "123"}\n```\n\nHello';
      const result = extractMessagesFromCtx({
        messages: [
          { role: "user", content: msg },
        ],
      });
      expect(result).toBe("User: Hello");
    });
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

  it("handles string content in user messages", () => {
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: "First as string" },
        { role: "assistant", content: [{ type: "text", text: "Reply" }] },
        { role: "user", content: "Second as string" },
      ],
    })).toBe("Second as string");
  });

  it("strips gralkor-memory from string content", () => {
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFact\n</gralkor-memory>\n';
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: `${xml}Actual question` },
      ],
    })).toBe("Actual question");
  });

  it("extracts output_text blocks from user messages", () => {
    expect(extractLastUserMessageFromMessages({
      messages: [
        { role: "user", content: [{ type: "output_text", text: "Question via output_text" }] },
      ],
    })).toBe("Question via output_text");
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

  it("includes temporal info on recalled facts", async () => {
    client.search.mockResolvedValue({
      ...emptySearchResults(),
      facts: [makeFact({
        group_id: "agent-42",
        fact: "Team uses React",
        valid_at: "2025-01-01T00:00:00Z",
        invalid_at: "2025-06-01T00:00:00Z",
      })],
    });

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    const result = await handler(
      { prompt: "What framework does the team use?" },
      { agentId: "agent-42" },
    );

    const ctx_result = (result as { prependContext: string }).prependContext;
    expect(ctx_result).toContain("Team uses React (created 2025-01-01T00:00:00Z) (valid from 2025-01-01T00:00:00Z) (invalid since 2025-06-01T00:00:00Z)");
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

  describe("when server is NOT ready", () => {
    it("skips graph search", async () => {
      const gate = createReadyGate();
      const handler = createBeforeAgentStartHandler(
        client as unknown as GraphitiClient, defaultConfig, undefined, undefined, gate,
      );
      await handler(
        { prompt: "Tell me about the project" },
        { agentId: "agent-42" },
      );

      expect(client.search).not.toHaveBeenCalled();
    });

    it("includes server-starting note in context when native results exist", async () => {
      const gate = createReadyGate();
      const nativeSearch = vi.fn().mockResolvedValue("Native result: project notes");
      const getNativeSearch = () => nativeSearch;

      const handler = createBeforeAgentStartHandler(
        client as unknown as GraphitiClient, defaultConfig, undefined, getNativeSearch, gate,
      );
      const result = await handler(
        { prompt: "Tell me about the project" },
        { agentId: "agent-42" },
      );

      expect(result).toHaveProperty("prependContext");
      const ctx_result = (result as { prependContext: string }).prependContext;
      expect(ctx_result).toContain("knowledge graph is still starting");
      expect(ctx_result).toContain("From native memory:");
    });

    it("returns starting note even without native results", async () => {
      const gate = createReadyGate();

      const handler = createBeforeAgentStartHandler(
        client as unknown as GraphitiClient, defaultConfig, undefined, undefined, gate,
      );
      const result = await handler(
        { prompt: "Tell me about the project" },
        { agentId: "agent-42" },
      );

      expect(result).toHaveProperty("prependContext");
      const ctx_result = (result as { prependContext: string }).prependContext;
      expect(ctx_result).toContain("knowledge graph is still starting");
    });
  });

  describe("when server IS ready", () => {
    it("searches graph as normal", async () => {
      const gate = createReadyGate();
      gate.resolve();
      client.search.mockResolvedValue({
        ...emptySearchResults(),
        facts: [makeFact({ fact: "A fact" })],
      });

      const handler = createBeforeAgentStartHandler(
        client as unknown as GraphitiClient, defaultConfig, undefined, undefined, gate,
      );
      const result = await handler(
        { prompt: "Tell me about the project" },
        { agentId: "agent-42" },
      );

      expect(client.search).toHaveBeenCalled();
      const ctx_result = (result as { prependContext: string }).prependContext;
      expect(ctx_result).toContain("A fact");
      expect(ctx_result).not.toContain("still starting");
    });
  });
});

describe("agent_end handler", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  afterEach(() => {
    buffers.clear();
  });

  it("buffers messages and flushes on boundary", async () => {
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

  it("propagates errors when Graphiti is unreachable on flush (after retries)", async () => {
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
      flushSessionBuffer(key, buffer, buffers, client as unknown as GraphitiClient, { retryDelayMs: 0 }),
    ).rejects.toThrow("ECONNREFUSED");
    expect(client.addEpisode).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
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
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
  });

  afterEach(() => {
    buffers.clear();
  });

  it("3 turns then session_end → single episode with full conversation", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const agentCtx = { agentId: "agent-1", sessionKey: "sess-1" };
    const sessionCtx = { agentId: "agent-1", sessionId: "sid-1", sessionKey: "sess-1" };

    // Turn 1: agent_end delivers full session history (1 exchange)
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "What's my name?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know yet." }] },
      ],
    }, agentCtx);

    // Turn 2: agent_end delivers full session history (2 exchanges)
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: "What's my name?" }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know yet." }] },
        { role: "user", content: [{ type: "text", text: "My name is Eli." }] },
        { role: "assistant", content: [{ type: "text", text: "Nice to meet you, Eli!" }] },
      ],
    }, agentCtx);

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
    }, agentCtx);

    // No episodes created yet
    expect(client.addEpisode).not.toHaveBeenCalled();

    // Session ends (flush is fire-and-forget)
    await sessionEnd({}, sessionCtx);
    await new Promise((r) => setTimeout(r, 0));

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
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
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

    // New session starts → previous session ends (flush is fire-and-forget)
    await sessionEnd({}, sessionCtx);
    await new Promise((r) => setTimeout(r, 0));

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).toContain("Hello");
    expect(body).toContain("Bye");
    expect(body).toContain("Goodbye!");
    expect(buffers.size).toBe(0);
  });

  it("two concurrent sessions flush independently", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);

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

    // End session 1 only (flush is fire-and-forget)
    await sessionEnd({}, { ...ctx1, sessionId: "sid-1" });
    await new Promise((r) => setTimeout(r, 0));

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body1 = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body1).toContain("Session 1");
    expect(buffers.size).toBe(1);
    expect(buffers.has("sess-2")).toBe(true);

    // End session 2 (flush is fire-and-forget)
    await sessionEnd({}, { ...ctx2, sessionId: "sid-2" });
    await new Promise((r) => setTimeout(r, 0));

    expect(client.addEpisode).toHaveBeenCalledTimes(2);
    const body2 = (client.addEpisode.mock.calls[1][0] as { episode_body: string }).episode_body;
    expect(body2).toContain("Session 2");
    expect(buffers.size).toBe(0);
  });

  it("string content flows through buffer → flush → addEpisode", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const agentCtx = { agentId: "agent-1", sessionKey: "sess-1" };
    const sessionCtx = { agentId: "agent-1", sessionId: "sid-1", sessionKey: "sess-1" };

    await agentEnd({
      messages: [
        { role: "user", content: "Hello from string content" },
        { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
        { role: "user", content: "Follow-up as string" },
        { role: "assistant", content: [{ type: "output_text", text: "Response via output_text" }] },
      ],
    }, agentCtx);

    expect(client.addEpisode).not.toHaveBeenCalled();

    await sessionEnd({}, sessionCtx);
    await new Promise((r) => setTimeout(r, 0));

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).toBe(
      "User: Hello from string content\n" +
      "Assistant: Hi there\n" +
      "User: Follow-up as string\n" +
      "Assistant: Response via output_text",
    );
  });

  it("strips gralkor-memory XML across accumulated turns", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    const agentCtx = { agentId: "agent-1", sessionKey: "sess-1" };
    const sessionCtx = { agentId: "agent-1", sessionId: "sid-1", sessionKey: "sess-1" };
    const xml = '<gralkor-memory source="auto-recall" trust="untrusted">\nFacts:\n- Name is Eli\n</gralkor-memory>\n';

    // Turn 1: has injected memory context
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What's my name?` }] },
        { role: "assistant", content: [{ type: "text", text: "Your name is Eli." }] },
      ],
    }, agentCtx);

    // Turn 2: also has injected memory context
    await agentEnd({
      messages: [
        { role: "user", content: [{ type: "text", text: `${xml}What's my name?` }] },
        { role: "assistant", content: [{ type: "text", text: "Your name is Eli." }] },
        { role: "user", content: [{ type: "text", text: `${xml}And my last name?` }] },
        { role: "assistant", content: [{ type: "text", text: "I don't know your last name." }] },
      ],
    }, agentCtx);

    await sessionEnd({}, sessionCtx);
    await new Promise((r) => setTimeout(r, 0));

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

  it("retries transient errors and succeeds", async () => {
    client.addEpisode
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("AbortError"))
      .mockResolvedValueOnce({});

    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient, { retryDelayMs: 0 });

    expect(client.addEpisode).toHaveBeenCalledTimes(3);
  });

  it("includes thinking blocks in flushed episode", async () => {
    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Fix the bug" }] },
        { role: "assistant", content: [
          { type: "thinking", thinking: "I should check auth.ts" },
          { type: "text", text: "Let me look at the auth module." },
          { type: "toolCall", name: "Read", input: { path: "auth.ts" } },
          { type: "text", text: "Found the bug on line 42." },
        ]},
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient);

    expect(client.addEpisode).toHaveBeenCalledWith(
      expect.objectContaining({
        episode_body:
          "User: Fix the bug\n" +
          "Assistant: (thinking: I should check auth.ts)\n" +
          "Assistant: Let me look at the auth module.\n" +
          "Assistant: Found the bug on line 42.",
      }),
    );
  });

  it("respects maxThinkingChars option when flushing", async () => {
    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [
          { type: "thinking", thinking: "X".repeat(200) },
          { type: "text", text: "Hi" },
        ]},
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient, { maxThinkingChars: 50 });

    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).toContain(`(thinking: ${"X".repeat(50)}...)`);
  });

  it("does not retry client errors (4xx)", async () => {
    client.addEpisode.mockRejectedValue(new Error("Graphiti returned 422: Unprocessable Entity"));

    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await expect(
      flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient, { retryDelayMs: 0 }),
    ).rejects.toThrow("422");
    expect(client.addEpisode).toHaveBeenCalledTimes(1);
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

    const handler = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({}, { sessionId: "sid-1", sessionKey: "session-abc" });

    // flush is fire-and-forget — wait for the microtask to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(buffers.size).toBe(0);
  });

  it("does nothing when no buffer exists", async () => {
    const handler = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    await handler({}, { sessionId: "sid-1", sessionKey: "nonexistent" });

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("does not throw when flush fails", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    buffers.set("session-abc", {
      messages: [
        { role: "user", content: [{ type: "text", text: "Conversation" }] },
        { role: "assistant", content: [{ type: "text", text: "Response" }] },
      ],
      agentId: "agent-42",
      sessionKey: "session-abc",
    });

    const handler = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers);
    // Should not throw despite flush failure
    await handler({}, { sessionId: "sid-1", sessionKey: "session-abc" });

    // Let the fire-and-forget flush (and its retries) settle
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("test mode logging", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    client.search.mockResolvedValue(emptySearchResults());
    buffers = new Map();
    consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    buffers.clear();
  });

  it("logs episode body in test mode during flush", async () => {
    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient, { test: true });

    const testLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("[test] episode body:"),
    );
    expect(testLogs).toHaveLength(1);
    expect(testLogs[0][0]).toContain("User: Hello\nAssistant: Hi");
  });

  it("does not log episode body when test mode is off", async () => {
    const buffer: SessionBuffer = {
      messages: [
        { role: "user", content: [{ type: "text", text: "Hello" }] },
        { role: "assistant", content: [{ type: "text", text: "Hi" }] },
      ],
      agentId: "agent-42",
    };
    buffers.set("key-1", buffer);

    await flushSessionBuffer("key-1", buffer, buffers, client as unknown as GraphitiClient, { test: false });

    const testLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("[test]"),
    );
    expect(testLogs).toHaveLength(0);
  });

  it("logs auto-recall context in test mode", async () => {
    client.search.mockResolvedValue({
      ...emptySearchResults(),
      facts: [makeFact({ fact: "Sky is blue" })],
    });

    const config: GralkorConfig = { ...defaultConfig, test: true };
    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, config);
    await handler({ prompt: "What color is the sky?" }, { agentId: "agent-42" });

    const testLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("[test] auto-recall context:"),
    );
    expect(testLogs).toHaveLength(1);
    expect(testLogs[0][0]).toContain("Sky is blue");
  });

  it("does not log auto-recall context when test mode is off", async () => {
    client.search.mockResolvedValue({
      ...emptySearchResults(),
      facts: [makeFact({ fact: "Sky is blue" })],
    });

    const handler = createBeforeAgentStartHandler(client as unknown as GraphitiClient, defaultConfig);
    await handler({ prompt: "What color is the sky?" }, { agentId: "agent-42" });

    const testLogs = consoleSpy.mock.calls.filter(
      (args) => typeof args[0] === "string" && args[0].includes("[test]"),
    );
    expect(testLogs).toHaveLength(0);
  });
});

describe("idle timeout flush", () => {
  let client: ReturnType<typeof mockClient>;
  let buffers: SessionBufferMap;
  let timers: IdleTimerMap;
  const idleConfig: GralkorConfig = {
    ...defaultConfig,
    idleTimeoutMs: 5 * 60 * 1000,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    client = mockClient();
    client.addEpisode.mockResolvedValue({});
    buffers = new Map();
    timers = new Map();
  });

  afterEach(() => {
    clearIdleTimers(timers);
    buffers.clear();
    vi.useRealTimers();
  });

  const simpleMessages = [
    { role: "user", content: [{ type: "text", text: "Hello" }] },
    { role: "assistant", content: [{ type: "text", text: "Hi there" }] },
  ];

  it("flushes after idle timeout", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);
    await handler({ messages: simpleMessages }, { agentId: "agent-1" });

    expect(client.addEpisode).not.toHaveBeenCalled();
    expect(timers.size).toBe(1);

    vi.advanceTimersByTime(5 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    expect(buffers.size).toBe(0);
    expect(timers.size).toBe(0);
  });

  it("resets timer on subsequent agent_end", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);

    await handler({ messages: simpleMessages }, { agentId: "agent-1" });

    // Advance 2 minutes, then another agent_end
    vi.advanceTimersByTime(2 * 60 * 1000);
    await handler({
      messages: [
        ...simpleMessages,
        { role: "user", content: [{ type: "text", text: "More" }] },
        { role: "assistant", content: [{ type: "text", text: "Sure" }] },
      ],
    }, { agentId: "agent-1" });

    // Advance to 4 min after first (2 min after second) — no flush yet
    vi.advanceTimersByTime(2 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(client.addEpisode).not.toHaveBeenCalled();

    // Advance to 5 min after second — should flush
    vi.advanceTimersByTime(3 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body).toContain("More");
  });

  it("session_end wins — timer cancelled", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers, timers);

    await agentEnd({ messages: simpleMessages }, { agentId: "agent-1", sessionKey: "sess-1" });
    expect(timers.size).toBe(1);

    // session_end fires before timeout
    await sessionEnd({}, { sessionId: "sid-1", sessionKey: "sess-1" });
    await vi.advanceTimersByTimeAsync(0);

    expect(timers.size).toBe(0);
    expect(client.addEpisode).toHaveBeenCalledTimes(1);

    // Advance past timeout — no second flush
    vi.advanceTimersByTime(5 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("idle timeout wins — session_end no-ops", async () => {
    const agentEnd = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);
    const sessionEnd = createSessionEndHandler(client as unknown as GraphitiClient, defaultConfig, buffers, timers);

    await agentEnd({ messages: simpleMessages }, { agentId: "agent-1", sessionKey: "sess-1" });

    // Idle timeout fires
    vi.advanceTimersByTime(5 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);

    // session_end fires after — should no-op (buffer already gone)
    await sessionEnd({}, { sessionId: "sid-1", sessionKey: "sess-1" });
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
  });

  it("independent timers per session", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);

    await handler({ messages: simpleMessages }, { sessionKey: "sess-1" });
    await handler({
      messages: [{ role: "user", content: [{ type: "text", text: "Session 2" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply 2" }] }],
    }, { sessionKey: "sess-2" });

    expect(timers.size).toBe(2);

    // Stagger: reset sess-2's timer by triggering another agent_end at +3min
    vi.advanceTimersByTime(3 * 60 * 1000);
    await handler({
      messages: [{ role: "user", content: [{ type: "text", text: "Session 2 updated" }] },
        { role: "assistant", content: [{ type: "text", text: "Reply 2 updated" }] }],
    }, { sessionKey: "sess-2" });

    // Advance to 5 min total — sess-1 fires, sess-2 has 2 min left
    vi.advanceTimersByTime(2 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(1);
    const body1 = (client.addEpisode.mock.calls[0][0] as { episode_body: string }).episode_body;
    expect(body1).toContain("Hello");

    // Advance remaining 3 min — sess-2 fires
    vi.advanceTimersByTime(3 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).toHaveBeenCalledTimes(2);
    const body2 = (client.addEpisode.mock.calls[1][0] as { episode_body: string }).episode_body;
    expect(body2).toContain("Session 2 updated");
  });

  it("clearIdleTimers cancels all", async () => {
    const handler = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);

    await handler({ messages: simpleMessages }, { sessionKey: "sess-1" });
    await handler({ messages: simpleMessages }, { sessionKey: "sess-2" });
    expect(timers.size).toBe(2);

    clearIdleTimers(timers);
    expect(timers.size).toBe(0);

    vi.advanceTimersByTime(5 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.addEpisode).not.toHaveBeenCalled();
  });

  it("idle flush error is caught (no unhandled rejection)", async () => {
    client.addEpisode.mockRejectedValue(new Error("ECONNREFUSED"));

    const handler = createAgentEndHandler(client as unknown as GraphitiClient, idleConfig, buffers, timers);

    await handler({ messages: simpleMessages }, { agentId: "agent-1" });

    vi.advanceTimersByTime(5 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(0);

    // The flush was attempted (addEpisode called at least once)
    expect(client.addEpisode).toHaveBeenCalled();
  });
});

