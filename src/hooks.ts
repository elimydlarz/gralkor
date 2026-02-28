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

  // Strip leading "System: ..." lines (queued events prepended by gateway)
  const stripped = prompt.replace(/^(?:System: [^\n]*\n\n)+/, "");

  // Skip system instructions
  if (stripped.startsWith("A new session was started")) return "";

  // Strip metadata wrapper if present
  const metadataPattern = /^Conversation info \(untrusted metadata\):\n```json\n[\s\S]*?\n```\n\n/;
  return stripped.replace(metadataPattern, "");
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
export function extractMessagesFromCtx(ctx: HookContext): string {
  const messages = ctx.messages;
  if (!messages || !Array.isArray(messages)) return "";

  const parts: string[] = [];

  for (const msg of messages) {
    const textParts = (msg.content ?? [])
      .filter((block: ContentBlock) => block.type === "text" && block.text)
      .map((block: ContentBlock) => block.text!)
      .join("\n");

    if (!textParts) continue;

    if (msg.role === "user") {
      parts.push(`User: ${textParts}`);
    } else if (msg.role === "assistant") {
      parts.push(`Assistant: ${textParts}`);
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

    const groupId = resolveGroupId({ agentId });
    console.log("[gralkor] [auto-recall] searching — query:", JSON.stringify(userMessage), "groupId:", groupId);

    try {
      const limit = config.autoRecall.maxResults;

      // Search graph facts, graph nodes, and native markdown in parallel
      const nativeSearch = getNativeSearch?.();
      const [facts, nodes, nativeResult] = await Promise.all([
        client.searchFacts(userMessage, [groupId], limit),
        client.searchNodes(userMessage, [groupId], limit),
        nativeSearch ? nativeSearch(userMessage).catch((err: unknown) => {
          console.warn("[gralkor] [auto-recall] native search failed:", err instanceof Error ? err.message : err);
          return null;
        }) : Promise.resolve(null),
      ]);

      console.log("[gralkor] [auto-recall] search returned", facts.length, "facts,", nodes.length, "nodes — groupId:", groupId);

      const sections: string[] = [];

      if (facts.length > 0) {
        sections.push("Facts from knowledge graph:\n" + facts.map((f) => `- ${f.fact}`).join("\n"));
      }

      if (nodes.length > 0) {
        sections.push("Entities from knowledge graph:\n" + nodes.map((n) => `- ${n.name}: ${n.summary}`).join("\n"));
      }

      if (nativeResult) {
        sections.push("From native memory:\n" + nativeResult);
      }

      if (sections.length === 0) return;

      const prependContext = `<gralkor-memory source="auto-recall" trust="untrusted">\n${sections.join("\n\n")}\n</gralkor-memory>`;
      console.log("[gralkor] [auto-recall] returning prependContext to agent — groupId:", groupId + ":\n" + prependContext);

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
  return async (ctx: HookContext): Promise<void> => {
    console.log("[gralkor] [auto-capture] hook fired — raw ctx (includes all message types):", debugCtx(ctx));

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] [auto-capture] disabled, skipping");
      return;
    }

    const conversation = extractMessagesFromCtx(ctx);
    console.log("[gralkor] [auto-capture] extracted conversation (user/assistant text only):\n" + conversation);

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
    console.log("[gralkor] [auto-capture] episode stored — groupId:", groupId, "— body:\n" + conversation);
  };
}
