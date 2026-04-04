import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatTranscript, DISTILL_SYSTEM_PROMPT, type EpisodeMessage } from "./distill.js";
import type { LLMClient } from "./llm-client.js";

function msg(role: "user" | "assistant", blocks: Array<[string, string]>): EpisodeMessage {
  return {
    role,
    content: blocks.map(([type, text]) => ({ type: type as EpisodeMessage["content"][number]["type"], text })),
  };
}

function mockLLM(response: string | (() => string)): LLMClient {
  let callCount = 0;
  return {
    generate: vi.fn(async () => {
      callCount++;
      return typeof response === "function" ? response() : response;
    }),
  };
}

describe("formatTranscript", () => {
  it("formats simple transcript", async () => {
    const msgs = [
      msg("user", [["text", "Fix the bug"]]),
      msg("assistant", [["text", "Fixed it!"]]),
    ];
    const result = await formatTranscript(msgs, null);
    expect(result).toBe("User: Fix the bug\nAssistant: Fixed it!");
  });

  it("formats multi-turn transcript", async () => {
    const msgs = [
      msg("user", [["text", "First"]]),
      msg("assistant", [["text", "A1"]]),
      msg("user", [["text", "Second"]]),
      msg("assistant", [["text", "A2"]]),
    ];
    const result = await formatTranscript(msgs, null);
    expect(result).toBe("User: First\nAssistant: A1\nUser: Second\nAssistant: A2");
  });

  it("distills thinking into behaviour", async () => {
    const llm = mockLLM("Resolved the null pointer");
    const msgs = [
      msg("user", [["text", "Fix the bug"]]),
      msg("assistant", [["thinking", "Let me search..."], ["text", "Fixed it!"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toBe(
      "User: Fix the bug\nAssistant: (behaviour: Resolved the null pointer)\nAssistant: Fixed it!",
    );
  });

  it("skips distillation when no thinking blocks", async () => {
    const llm: LLMClient = { generate: vi.fn() };
    const msgs = [
      msg("user", [["text", "Hello"]]),
      msg("assistant", [["text", "Hi"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toBe("User: Hello\nAssistant: Hi");
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it("drops behaviour line when distillation fails", async () => {
    const llm: LLMClient = { generate: vi.fn().mockRejectedValue(new Error("LLM down")) };
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const msgs = [
      msg("user", [["text", "Fix it"]]),
      msg("assistant", [["thinking", "thinking..."], ["text", "Done"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toBe("User: Fix it\nAssistant: Done");
    expect(result).not.toContain("(behaviour:");
    warnSpy.mockRestore();
  });

  it("skips behaviour when no llmClient", async () => {
    const msgs = [
      msg("user", [["text", "Fix it"]]),
      msg("assistant", [["thinking", "thinking..."], ["text", "Done"]]),
    ];
    const result = await formatTranscript(msgs, null);
    expect(result).toBe("User: Fix it\nAssistant: Done");
  });

  it("distills across multiple turns", async () => {
    let callCount = 0;
    const llm: LLMClient = {
      generate: vi.fn(async () => `Action ${++callCount}`),
    };
    const msgs = [
      msg("user", [["text", "Q1"]]),
      msg("assistant", [["thinking", "T1"], ["text", "A1"]]),
      msg("user", [["text", "Q2"]]),
      msg("assistant", [["thinking", "T2"], ["text", "A2"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toContain("Assistant: (behaviour: Action 1)");
    expect(result).toContain("Assistant: (behaviour: Action 2)");
  });

  it("groups multiple assistant messages per turn", async () => {
    const llm = mockLLM("Did the thing");
    const msgs = [
      msg("user", [["text", "Do something"]]),
      msg("assistant", [["thinking", "First thought"]]),
      msg("assistant", [["thinking", "Second thought"], ["text", "Done"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toBe(
      "User: Do something\nAssistant: (behaviour: Did the thing)\nAssistant: Done",
    );
  });

  it("returns empty string for empty messages", async () => {
    const result = await formatTranscript([], null);
    expect(result).toBe("");
  });

  it("handles assistant message before first user message", async () => {
    const llm = mockLLM("Did something");
    const msgs = [
      msg("assistant", [["thinking", "Startup thinking"], ["text", "Hello, I'm ready"]]),
      msg("user", [["text", "Great"]]),
      msg("assistant", [["text", "How can I help?"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toContain("Assistant: Hello, I'm ready");
    expect(result).toContain("User: Great");
    expect(result).toContain("Assistant: How can I help?");
  });

  it("handles thinking-only assistant turn with no text", async () => {
    const llm = mockLLM("Investigated the issue");
    const msgs = [
      msg("user", [["text", "Fix the bug"]]),
      msg("assistant", [["thinking", "I need to investigate"]]),
      msg("assistant", [["text", "Found and fixed it"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toContain("Assistant: (behaviour: Investigated the issue)");
    expect(result).toContain("Assistant: Found and fixed it");
  });

  it("skips whitespace-only thinking", async () => {
    const llm: LLMClient = { generate: vi.fn() };
    const msgs = [
      msg("user", [["text", "Hello"]]),
      msg("assistant", [["thinking", "   \n  "], ["text", "Hi"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).not.toContain("(behaviour:");
    expect(llm.generate).not.toHaveBeenCalled();
  });

  it("includes tool_use blocks in distillation input", async () => {
    const llm: LLMClient = { generate: vi.fn().mockResolvedValue("Read auth.ts and fixed the bug") };
    const toolUseText = 'Tool: Read\nInput: {"path":"auth.ts"}';
    const msgs = [
      msg("user", [["text", "Fix the bug"]]),
      msg("assistant", [
        ["thinking", "I should check auth.ts"],
        ["tool_use", toolUseText],
        ["text", "Fixed it!"],
      ]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toContain("Assistant: (behaviour: Read auth.ts and fixed the bug)");
    expect(result).toContain("Assistant: Fixed it!");
    const callArg = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ role: string; content: string }>;
    const distillInput = callArg.find((m) => m.role === "user")?.content ?? "";
    expect(distillInput).toContain("I should check auth.ts");
    expect(distillInput).toContain("Tool: Read");
  });

  it("includes tool_result blocks in distillation input", async () => {
    const llm: LLMClient = { generate: vi.fn().mockResolvedValue("Read the file and found the issue") };
    const msgs = [
      msg("user", [["text", "Fix it"]]),
      msg("assistant", [["tool_use", 'Tool: Read\nInput: {"path":"auth.ts"}']]),
      msg("assistant", [["tool_result", "function authenticate() { return null; }"]]),
      msg("assistant", [["text", "Found the bug"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toContain("Assistant: (behaviour: Read the file and found the issue)");
    const callArg = (llm.generate as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ role: string; content: string }>;
    const distillInput = callArg.find((m) => m.role === "user")?.content ?? "";
    expect(distillInput).toContain("Tool: Read");
    expect(distillInput).toContain("authenticate");
  });

  it("tool_use-only turn gets behaviour summary", async () => {
    const llm = mockLLM("Searched the codebase");
    const msgs = [
      msg("user", [["text", "Find the auth code"]]),
      msg("assistant", [["tool_use", 'Tool: Grep\nInput: {"query":"authenticate"}']]),
      msg("assistant", [["text", "Found it in auth.ts"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).toContain("Assistant: (behaviour: Searched the codebase)");
    expect(result).toContain("Assistant: Found it in auth.ts");
  });

  it("aligns behaviour to correct turn", async () => {
    const llm = mockLLM("Searched memory");
    const msgs = [
      msg("user", [["text", "Hello"]]),
      msg("assistant", [["text", "Hi"]]),
      msg("user", [["text", "What about X?"]]),
      msg("assistant", [["text", "Sure"]]),
      msg("user", [["text", "Find it"]]),
      msg("assistant", [["tool_use", 'Tool: search\nInput: {"q":"X"}'], ["text", "Found it"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    const lines = result.split("\n");
    expect(lines[0]).toBe("User: Hello");
    expect(lines[1]).toBe("Assistant: Hi");
    expect(lines[2]).toBe("User: What about X?");
    expect(lines[3]).toBe("Assistant: Sure");
    expect(lines[4]).toBe("User: Find it");
    expect(lines[5]).toBe("Assistant: (behaviour: Searched memory)");
    expect(lines[6]).toBe("Assistant: Found it");
  });

  it("aligns behaviour across many empty turns", async () => {
    let callCount = 0;
    const llm: LLMClient = { generate: vi.fn(async () => `Action ${++callCount}`) };
    const msgs = [
      msg("user", [["text", "Q1"]]),
      msg("assistant", [["text", "A1"]]),
      msg("user", [["text", "Q2"]]),
      msg("assistant", [["text", "A2"]]),
      msg("user", [["text", "Q3"]]),
      msg("assistant", [["text", "A3"]]),
      msg("user", [["text", "Q4"]]),
      msg("assistant", [["thinking", "T4"], ["text", "A4"]]),
      msg("user", [["text", "Q5"]]),
      msg("assistant", [["tool_use", "Tool: X"], ["text", "A5"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    const lines = result.split("\n");
    expect(lines[0]).toBe("User: Q1");
    expect(lines[1]).toBe("Assistant: A1");
    expect(lines[2]).toBe("User: Q2");
    expect(lines[3]).toBe("Assistant: A2");
    expect(lines[4]).toBe("User: Q3");
    expect(lines[5]).toBe("Assistant: A3");
    expect(lines[6]).toBe("User: Q4");
    expect(lines[7]).toBe("Assistant: (behaviour: Action 1)");
    expect(lines[8]).toBe("Assistant: A4");
    expect(lines[9]).toBe("User: Q5");
    expect(lines[10]).toBe("Assistant: (behaviour: Action 2)");
    expect(lines[11]).toBe("Assistant: A5");
  });

  it("drops behaviour line when LLM returns empty content", async () => {
    const llm = mockLLM("");
    const msgs = [
      msg("user", [["text", "Fix it"]]),
      msg("assistant", [["thinking", "pondering..."], ["text", "Done"]]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).not.toContain("(behaviour:");
    expect(result).toContain("Assistant: Done");
  });

  it("tool blocks do not appear as raw transcript lines", async () => {
    const llm = mockLLM("Did stuff");
    const msgs = [
      msg("user", [["text", "Do it"]]),
      msg("assistant", [
        ["tool_use", 'Tool: Read\nInput: {"path":"x.ts"}'],
        ["tool_result", "file contents here"],
        ["text", "Done"],
      ]),
    ];
    const result = await formatTranscript(msgs, llm);
    expect(result).not.toContain("Tool: Read");
    expect(result).not.toContain("file contents here");
    expect(result).toContain("Assistant: Done");
  });
});

describe("DISTILL_SYSTEM_PROMPT", () => {
  it("instructs first-person past-tense output", () => {
    expect(DISTILL_SYSTEM_PROMPT).toContain("first person");
    expect(DISTILL_SYSTEM_PROMPT).toContain("past tense");
  });

  it("instructs not to repeat recalled memory content", () => {
    expect(DISTILL_SYSTEM_PROMPT).toContain("memory");
    expect(DISTILL_SYSTEM_PROMPT).toContain("NOT");
  });
});
