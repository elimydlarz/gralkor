import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

/**
 * A content block inside a message entry.
 */
interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * A message entry in the OpenClaw messages array.
 */
interface MessageEntry {
  role: string;
  content: ContentBlock[];
}

/**
 * Hook context provided by the OpenClaw gateway.
 * Handlers receive a single ctx object — NOT (event, ctx).
 *
 * before_agent_start: { prompt, messages? }
 * agent_end: { messages, success, error, durationMs }
 */
interface HookContext {
  prompt?: string;
  messages?: MessageEntry[];
  success?: boolean;
  error?: unknown;
  durationMs?: number;
  agentId?: string; // absent in practice (OpenClaw ≥ 2026.2), kept for group_id if it appears
}

/* Debug helper: summarise any ctx for logging without dumping megabytes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function debugCtx(ctx: any): Record<string, unknown> {
  const out: Record<string, unknown> = { keys: Object.keys(ctx) };

  // prompt — expected string
  if (typeof ctx.prompt === "string") out.prompt = ctx.prompt.slice(0, 200);
  else if (ctx.prompt !== undefined) out.promptType = typeof ctx.prompt;

  // messages — expected array of {role, content, ...}
  if (Array.isArray(ctx.messages)) {
    out.messagesCount = ctx.messages.length;
    out.tail = ctx.messages.slice(-3).map((m: any) => ({
      role: m.role,
      contentType: typeof m.content,
      preview: typeof m.content === "string"
        ? m.content.slice(0, 120)
        : Array.isArray(m.content)
          ? JSON.stringify(m.content.slice(0, 2)).slice(0, 200)
          : String(m.content).slice(0, 80),
    }));
  }

  // pass-through scalars (agentId, success, error, durationMs, etc.)
  for (const k of Object.keys(ctx)) {
    if (k === "prompt" || k === "messages") continue;
    const v = ctx[k];
    if (typeof v === "string") out[k] = v.slice(0, 120);
    else out[k] = v;
  }
  return out;
}

/**
 * Extract the user's actual message from ctx.prompt (before_agent_start).
 *
 * The prompt may be wrapped in metadata:
 *   "Conversation info (untrusted metadata):\n```json\n{...}\n```\n\nActual message"
 *
 * System prompts (e.g. "A new session was started via /new") are not user messages.
 */
export function extractUserMessageFromPrompt(ctx: HookContext): string {
  const prompt = ctx.prompt;
  if (!prompt) return "";

  // Skip system instructions
  if (prompt.startsWith("A new session was started")) return "";

  // Strip metadata wrapper if present
  const metadataPattern = /^Conversation info \(untrusted metadata\):\n```json\n[\s\S]*?\n```\n\n/;
  return prompt.replace(metadataPattern, "");
}

/**
 * Extract last user message and last assistant response from ctx.messages (agent_end).
 *
 * Each message has role ("user"/"assistant"/"toolResult") and content (array of blocks).
 * We extract text blocks, skipping pure tool-call entries.
 */
export function extractMessagesFromCtx(ctx: HookContext): { userMessage: string; agentResponse: string } {
  const messages = ctx.messages;
  if (!messages || !Array.isArray(messages)) return { userMessage: "", agentResponse: "" };

  let userMessage = "";
  let agentResponse = "";

  for (const msg of messages) {
    const textParts = (msg.content ?? [])
      .filter((block: ContentBlock) => block.type === "text" && block.text)
      .map((block: ContentBlock) => block.text!)
      .join("\n");

    if (!textParts) continue;

    if (msg.role === "user") {
      userMessage = textParts;
    } else if (msg.role === "assistant") {
      agentResponse = textParts;
    }
  }

  return { userMessage, agentResponse };
}

export function extractKeyTerms(text: string): string {
  // Strip very short/common words to build a search query from the user message
  const stopWords = new Set([
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
    "as", "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "each",
    "every", "both", "few", "more", "most", "other", "some", "such", "no",
    "nor", "not", "only", "own", "same", "so", "than", "too", "very",
    "just", "because", "but", "and", "or", "if", "while", "about", "up",
    "it", "its", "i", "me", "my", "you", "your", "he", "him", "his",
    "she", "her", "we", "us", "our", "they", "them", "their", "this",
    "that", "these", "those", "what", "which", "who", "whom",
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  // Take the most distinctive words (up to 8)
  return words.slice(0, 8).join(" ");
}

export function createBeforeAgentStartHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  setGroupId?: (id: string) => void,
) {
  return async (ctx: HookContext): Promise<{ prependContext?: string } | void> => {
    console.log("[gralkor] [auto-recall] hook fired — ctx:", debugCtx(ctx));

    const agentId = ctx.agentId;
    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log("[gralkor] [auto-recall] disabled, skipping");
      return;
    }

    const userMessage = extractUserMessageFromPrompt(ctx);
    if (!userMessage) {
      console.log("[gralkor] [auto-recall] no user message in prompt, skipping");
      return;
    }

    const query = extractKeyTerms(userMessage);
    if (!query) {
      console.log("[gralkor] [auto-recall] no key terms extracted, skipping");
      return;
    }

    const groupId = resolveGroupId({ agentId });
    console.log("[gralkor] [auto-recall] searching — query:", JSON.stringify(query), "groupId:", groupId);

    try {
      const facts = await client.searchFacts(
        query,
        [groupId],
        config.autoRecall.maxResults,
      );

      console.log("[gralkor] [auto-recall] search returned", facts.length, "facts — groupId:", groupId, "—", facts.map((f) => f.fact));

      if (facts.length === 0) return;

      const formatted = facts
        .map((f) => `- ${f.fact}`)
        .join("\n");

      return {
        prependContext: `<gralkor-memory source="auto-recall" trust="untrusted">\nRelevant facts from knowledge graph:\n${formatted}\n</gralkor-memory>`,
      };
    } catch (err) {
      console.warn("[gralkor] [auto-recall] search failed:", err instanceof Error ? err.message : err);
      return;
    }
  };
}

export function createAgentEndHandler(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  return async (ctx: HookContext): Promise<void> => {
    console.log("[gralkor] [auto-capture] hook fired — ctx:", debugCtx(ctx));

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] [auto-capture] disabled, skipping");
      return;
    }

    const { userMessage, agentResponse } = extractMessagesFromCtx(ctx);

    if (!userMessage && !agentResponse) {
      console.log("[gralkor] [auto-capture] no messages extracted, skipping");
      return;
    }

    if (userMessage.startsWith("/")) {
      console.log("[gralkor] [auto-capture] slash command, skipping");
      return;
    }

    const agentId = ctx.agentId;
    const groupId = resolveGroupId({ agentId });
    const body = `User: ${userMessage}\nAssistant: ${agentResponse}`;

    console.log("[gralkor] [auto-capture] storing episode — groupId:", groupId, "bodyLength:", body.length);

    try {
      await client.addEpisode({
        name: `conversation-${Date.now()}`,
        episode_body: body,
        source_description: "auto-capture",
        group_id: groupId,
      });
      console.log("[gralkor] [auto-capture] episode stored successfully");
    } catch (err) {
      console.warn("[gralkor] [auto-capture] store failed:", err instanceof Error ? err.message : err);
    }
  };
}
