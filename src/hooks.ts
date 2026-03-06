import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

const TIMESTAMP_RE = /^\[timestamp:\s*(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\]\s*/;

export function extractTimestamp(text: string): { timestamp: string | null; stripped: string } {
  const match = text.match(TIMESTAMP_RE);
  if (!match) return { timestamp: null, stripped: text };
  return { timestamp: match[1], stripped: text.slice(match[0].length) };
}

interface ExtractedConversation {
  text: string;
  firstTimestamp: string | null;
}

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
 * Hook event — the first argument passed to hook handlers.
 *
 * before_agent_start: { prompt, messages? }
 * agent_end: { messages, success, error, durationMs }
 */
export interface HookEvent {
  prompt?: string;
  messages?: MessageEntry[];
  success?: boolean;
  error?: unknown;
  durationMs?: number;
}

/**
 * Hook agent context — the second argument passed to hook handlers.
 * Contains per-agent identity and session info.
 */
export interface HookAgentContext {
  agentId?: string;
  sessionKey?: string;
  sessionId?: string;
  workspaceDir?: string;
  messageProvider?: string;
}

/**
 * Extract the user's actual message from ctx.prompt (before_agent_start).
 *
 * The prompt may be wrapped in metadata:
 *   "Sender (untrusted metadata):\n```json\n{...}\n```\n\nActual message"
 *
 * System prompts (e.g. "A new session was started via /new") are not user messages.
 */
export function extractUserMessageFromPrompt(event: HookEvent): string {
  const prompt = event.prompt;
  if (!prompt) return "";

  // Strip leading "System: ..." lines (queued events prepended by gateway)
  const stripped = prompt.replace(/^(?:System: [^\n]*\n\n)+/, "");

  // Strip session-start system instruction (may have user message after it)
  const afterSession = stripped.replace(/^A new session was started[^\n]*(?:\n\n)?/, "");
  if (!afterSession) return "";

  // Strip metadata wrapper if present
  const metadataPattern = /^.+?\(untrusted metadata\):\n```json\n[\s\S]*?\n```\n\n/;
  const fromPrompt = afterSession.replace(metadataPattern, "").trim();
  if (fromPrompt) return extractTimestamp(fromPrompt).stripped;

  // Fallback: prompt was only metadata with no user text after it.
  // Extract the last user message from event.messages (available on 2nd fire).
  return extractLastUserMessageFromMessages(event);
}

/**
 * Extract the last user message text from event.messages.
 * Used as fallback when the prompt contains only metadata wrapper
 * and the user text is not appended after it.
 */
export function extractLastUserMessageFromMessages(event: HookEvent): string {
  const messages = event.messages;
  if (!messages || !Array.isArray(messages)) return "";

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      const text = (messages[i].content ?? [])
        .filter((block: ContentBlock) => block.type === "text" && block.text)
        .map((block: ContentBlock) => block.text!)
        .join("\n")
        .replace(/<gralkor-memory[\s\S]*?<\/gralkor-memory>\n*/g, "")
        .trim();
      if (text) return extractTimestamp(text).stripped;
    }
  }
  return "";
}

/**
 * Extract all user and assistant messages from ctx.messages (agent_end).
 *
 * Each message has role ("user"/"assistant"/"toolResult") and content (array of blocks).
 * We extract text blocks, skipping pure tool-call entries.
 *
 * Returns a multi-turn conversation string:
 *   "User: ...\nAssistant: ...\nUser: ...\nAssistant: ..."
 */
export function extractMessagesFromCtx(event: HookEvent): string {
  const messages = event.messages;
  if (!messages || !Array.isArray(messages)) return "";

  const parts: string[] = [];

  for (const msg of messages) {
    const textParts = (msg.content ?? [])
      .filter((block: ContentBlock) => block.type === "text" && block.text)
      .map((block: ContentBlock) => block.text!)
      .join("\n");

    if (!textParts) continue;

    // Strip injected auto-recall XML from user messages to prevent feedback loop
    const cleanText = msg.role === "user"
      ? textParts.replace(/<gralkor-memory[\s\S]*?<\/gralkor-memory>\n*/g, "").trim()
      : textParts;

    if (!cleanText) continue;

    if (msg.role === "user") {
      parts.push(`User: ${cleanText}`);
    } else if (msg.role === "assistant") {
      parts.push(`Assistant: ${cleanText}`);
    }
  }

  return parts.join("\n");
}

export type NativeSearchFn = (query: string) => Promise<string>;

export function createBeforeAgentStartHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  setGroupId?: (id: string) => void,
  getNativeSearch?: () => NativeSearchFn | null,
) {
  return async (event: HookEvent, ctx: HookAgentContext = {}): Promise<{ prependContext?: string } | void> => {
    console.log("[gralkor] [auto-recall] hook fired — agentId:", ctx.agentId, "hasPrompt:", !!event.prompt, "hasMessages:", !!event.messages);

    const agentId = ctx.agentId;
    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log("[gralkor] [auto-recall] disabled, skipping");
      return;
    }

    const userMessage = extractUserMessageFromPrompt(event);
    if (!userMessage) {
      console.log("[gralkor] [auto-recall] no user message in prompt, skipping — promptLength:", event.prompt?.length ?? 0, "messageCount:", event.messages?.length ?? 0);
      return;
    }

    const groupId = resolveGroupId({ agentId });
    console.log("[gralkor] [auto-recall] searching — groupId:", groupId);

    try {
      const limit = config.autoRecall.maxResults;

      // Search graph facts and native markdown in parallel
      const nativeSearch = getNativeSearch?.();
      const [facts, nativeResult] = await Promise.all([
        client.searchFacts(userMessage, [groupId], limit),
        nativeSearch ? nativeSearch(userMessage).catch((err: unknown) => {
          console.warn("[gralkor] [auto-recall] native search failed:", err instanceof Error ? err.message : err);
          return null;
        }) : Promise.resolve(null),
      ]);

      console.log("[gralkor] [auto-recall] search returned", facts.length, "facts — groupId:", groupId);

      const sections: string[] = [];

      if (facts.length > 0) {
        sections.push("Facts from knowledge graph:\n" + facts.map((f) => `- ${f.fact}`).join("\n"));
      }

      if (nativeResult) {
        sections.push("From native memory:\n" + nativeResult);
      }

      if (sections.length === 0) return;

      const prependContext = `<gralkor-memory source="auto-recall" trust="untrusted">\n${sections.join("\n\n")}\n</gralkor-memory>`;
      console.log("[gralkor] [auto-recall] returning prependContext — groupId:", groupId, "sections:", sections.length);

      return { prependContext };
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
  return async (event: HookEvent, ctx: HookAgentContext = {}): Promise<void> => {
    console.log("[gralkor] [auto-capture] hook fired — agentId:", ctx.agentId, "messageCount:", event.messages?.length ?? 0, "success:", event.success);

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] [auto-capture] disabled, skipping");
      return;
    }

    const conversation = extractMessagesFromCtx(event);

    if (!conversation) {
      console.log("[gralkor] [auto-capture] no messages extracted, skipping");
      return;
    }

    // Check if the first user message is a slash command
    const firstUserLine = conversation.match(/^User: (.+)$/m);
    if (firstUserLine && firstUserLine[1].startsWith("/")) {
      console.log("[gralkor] [auto-capture] slash command, skipping");
      return;
    }

    const agentId = ctx.agentId;
    const groupId = resolveGroupId({ agentId });

    console.log("[gralkor] [auto-capture] storing episode — groupId:", groupId, "bodyLength:", conversation.length);

    await client.addEpisode({
      name: `conversation-${Date.now()}`,
      episode_body: conversation,
      source_description: "auto-capture",
      group_id: groupId,
    });
    console.log("[gralkor] [auto-capture] episode stored — groupId:", groupId, "bodyLength:", conversation.length);
  };
}
