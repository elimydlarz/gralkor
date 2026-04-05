import type { LLMClient, LLMMessage } from "./llm-client.js";

/** A filtered content block for episode ingestion. */
export interface EpisodeBlock {
  type: "text" | "thinking" | "tool_use" | "tool_result";
  text: string;
}

/** A filtered message for episode ingestion. */
export interface EpisodeMessage {
  role: "user" | "assistant";
  content: EpisodeBlock[];
}

export const DISTILL_SYSTEM_PROMPT =
  "You are a distillery for agentic thought and action. Given an AI agent's thinking and " +
  "actions from a task, write one to two sentences in first person past tense capturing " +
  "the reasoning, decisions, and actions that drove the outcome — including the whole " +
  "journey of thought and intermediary steps, not just the final response. When the agent " +
  "retrieved information from memory, do not restate it — note only that memory was " +
  "consulted and what the agent concluded as a result. Output only the distilled text.";

interface Turn {
  userLines: string[];
  behaviour: string[];
  assistantLines: string[];
}

async function distillOne(llmClient: LLMClient, thinking: string): Promise<string> {
  const messages: LLMMessage[] = [
    { role: "system", content: DISTILL_SYSTEM_PROMPT },
    { role: "user", content: thinking },
  ];
  return llmClient.generate(messages, 300);
}

async function safeDistill(llmClient: LLMClient, thinking: string): Promise<string> {
  if (!thinking.trim()) return "";
  try {
    return await distillOne(llmClient, thinking);
  } catch (err) {
    console.warn("[gralkor] behaviour distillation failed:", err instanceof Error ? err.message : err);
    return "";
  }
}

/**
 * Format structured episode messages into a transcript, distilling behaviour blocks
 * (thinking, tool_use, tool_result) into per-turn summaries via LLM.
 *
 * Port of server-side _format_transcript(). When llmClient is null, behaviour
 * blocks are silently dropped (no distillation).
 */
export async function formatTranscript(
  messages: EpisodeMessage[],
  llmClient: LLMClient | null,
): Promise<string> {
  // Parse into turns: user message → assistant responses until next user
  const turns: Turn[] = [{ userLines: [], behaviour: [], assistantLines: [] }];

  for (const msg of messages) {
    if (msg.role === "user") {
      turns.push({ userLines: [], behaviour: [], assistantLines: [] });
      for (const block of msg.content) {
        if (block.type === "text") turns[turns.length - 1].userLines.push(block.text);
      }
    } else if (msg.role === "assistant") {
      for (const block of msg.content) {
        if (block.type === "thinking" || block.type === "tool_use" || block.type === "tool_result") {
          turns[turns.length - 1].behaviour.push(block.text);
        } else if (block.type === "text") {
          turns[turns.length - 1].assistantLines.push(block.text);
        }
      }
    }
  }

  // Distill behaviour blocks — only for turns that have them
  const toDistill = turns
    .map((t, i) => ({ i, text: t.behaviour.join("\n---\n") }))
    .filter(({ text }) => text.length > 0);

  const summaries = new Map<number, string>();
  if (toDistill.length > 0 && llmClient) {
    const texts = toDistill.map(({ text }) => text);
    const sizes = texts.map((t) => t.length);
    const totalChars = sizes.reduce((s, n) => s + n, 0);
    console.log(`[gralkor] behaviour distillation — groups:${texts.length} sizes:[${sizes.join(",")}] totalChars:${totalChars}`);

    const results = await Promise.all(texts.map((t) => safeDistill(llmClient, t)));
    let succeeded = 0;
    for (let j = 0; j < toDistill.length; j++) {
      if (results[j]) {
        summaries.set(toDistill[j].i, results[j]);
        succeeded++;
      }
    }
    console.log(`[gralkor] behaviour distilled — ${succeeded}/${texts.length} succeeded`);
  }

  // Format transcript
  const lines: string[] = [];
  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    for (const text of turn.userLines) lines.push(`User: ${text}`);
    const summary = summaries.get(i);
    if (summary) lines.push(`Assistant: (behaviour: ${summary})`);
    for (const text of turn.assistantLines) lines.push(`Assistant: ${text}`);
  }

  return lines.join("\n");
}
