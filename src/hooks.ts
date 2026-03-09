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
 * Hook agent context — the second argument passed to agent hook handlers.
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
 * Hook session context — passed to session hooks (session_start, session_end).
 * Has required sessionId unlike HookAgentContext.
 */
export interface HookSessionContext {
  agentId?: string;
  sessionId: string;
  sessionKey?: string;
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
  if (fromPrompt) return fromPrompt;

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
      if (text) return text;
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
  // Deduplicate the double-fire: cache result for same query within a short window.
  // before_agent_start fires twice per agent run (OpenClaw behavior) — only the 2nd
  // fire's prependContext is used, but both trigger expensive searches. We cache the
  // result from the 1st fire and return it on the 2nd.
  let lastQuery = "";
  let lastResult: { prependContext?: string } | void;
  let lastResultAt = 0;

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

    // Deduplicate: if we searched for the same query within 5s, return cached result.
    // This prevents the double-fire from doubling API calls.
    const now = Date.now();
    if (userMessage === lastQuery && now - lastResultAt < 5_000) {
      console.log("[gralkor] [auto-recall] returning cached result (double-fire dedup)");
      return lastResult;
    }

    const groupId = resolveGroupId({ agentId });
    console.log("[gralkor] [auto-recall] searching — groupId:", groupId);

    try {
      const limit = config.autoRecall.maxResults;

      // Search graph and native markdown in parallel
      const nativeSearch = getNativeSearch?.();
      const [searchResults, nativeResult] = await Promise.all([
        client.search(userMessage, [groupId], limit),
        nativeSearch ? nativeSearch(userMessage).catch((err: unknown) => {
          console.warn("[gralkor] [auto-recall] native search failed:", err instanceof Error ? err.message : err);
          return null;
        }) : Promise.resolve(null),
      ]);

      console.log("[gralkor] [auto-recall] search returned", searchResults.facts.length, "facts,", searchResults.nodes.length, "nodes,", searchResults.communities.length, "communities — groupId:", groupId);

      const sections: string[] = [];

      if (searchResults.facts.length > 0) {
        sections.push("Facts from knowledge graph:\n" + searchResults.facts.map((f) => `- ${f.fact}`).join("\n"));
      }

      if (searchResults.nodes.length > 0) {
        sections.push("Entities from knowledge graph:\n" + searchResults.nodes.map((n) => `- ${n.name}: ${n.summary}`).join("\n"));
      }

      if (searchResults.communities.length > 0) {
        sections.push("Topics from knowledge graph:\n" + searchResults.communities.map((c) => `- ${c.name}: ${c.summary}`).join("\n"));
      }

      if (nativeResult) {
        sections.push("From native memory:\n" + nativeResult);
      }

      if (sections.length === 0) {
        lastQuery = userMessage;
        lastResult = undefined;
        lastResultAt = now;
        return;
      }

      const prependContext = `<gralkor-memory source="auto-recall" trust="untrusted">\n${sections.join("\n\n")}\n</gralkor-memory>`;
      console.log("[gralkor] [auto-recall] returning prependContext — groupId:", groupId, "sections:", sections.length);

      const result = { prependContext };
      lastQuery = userMessage;
      lastResult = result;
      lastResultAt = now;

      return result;
    } catch (err) {
      console.warn("[gralkor] [auto-recall] search failed:", err instanceof Error ? err.message : err);
      return;
    }
  };
}

/**
 * Session buffer entry — holds the latest message snapshot for a session,
 * flushed as a single episode at session boundaries or on idle timeout.
 *
 * `flushedMessageCount` tracks how many messages from the front of the array
 * have already been flushed, so incremental flushes only send new messages.
 */
export interface SessionBuffer {
  messages: MessageEntry[];
  agentId?: string;
  sessionKey?: string;
  lastSeenAt: number;
  flushedMessageCount: number;
  timer: ReturnType<typeof setTimeout>;
}

export type SessionBufferMap = Map<string, SessionBuffer>;

function resolveBufferKey(ctx: { sessionKey?: string; agentId?: string }): string {
  return ctx.sessionKey || ctx.agentId || "default";
}

/**
 * Flush a single session buffer → episode, then delete it from the map.
 * Shared by all flush triggers (idle timer, before_reset, session_end, gateway_stop).
 */
export async function flushSessionBuffer(
  key: string,
  buffer: SessionBuffer,
  buffers: SessionBufferMap,
  client: GraphitiClient,
): Promise<void> {
  clearTimeout(buffer.timer);

  // Only send messages that haven't been flushed yet (incremental flush).
  // On boundary flushes (before_reset, session_end, gateway_stop) we delete
  // the buffer entirely. On idle flushes we keep the buffer but advance the
  // flushedMessageCount so the next flush only sends new messages.
  const newMessages = buffer.messages.slice(buffer.flushedMessageCount);
  const isBoundaryFlush = !buffers.has(key) || buffer.messages === buffers.get(key)?.messages;

  const conversation = extractMessagesFromCtx({ messages: newMessages });
  if (!conversation) {
    console.log("[gralkor] [auto-capture] flush skipped — no new messages extracted, key:", key);
    buffers.delete(key);
    return;
  }

  // Skip slash commands (only check on first flush for this session)
  if (buffer.flushedMessageCount === 0) {
    const firstUserLine = conversation.match(/^User: (.+)$/m);
    if (firstUserLine && firstUserLine[1].startsWith("/")) {
      console.log("[gralkor] [auto-capture] flush skipped — slash command, key:", key);
      buffers.delete(key);
      return;
    }
  }

  const groupId = resolveGroupId({ agentId: buffer.agentId });
  console.log("[gralkor] [auto-capture] flushing episode — key:", key, "groupId:", groupId, "bodyLength:", conversation.length, "newMessages:", newMessages.length, "totalMessages:", buffer.messages.length);

  await client.addEpisode({
    name: `conversation-${Date.now()}`,
    episode_body: conversation,
    source_description: "auto-capture",
    group_id: groupId,
  });

  // Advance the watermark so next flush only sends new messages
  buffer.flushedMessageCount = buffer.messages.length;

  // Boundary flushes remove the buffer; idle flushes keep it for incremental use
  buffers.delete(key);

  console.log("[gralkor] [auto-capture] episode flushed — key:", key, "groupId:", groupId);
}

export function createAgentEndHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  buffers: SessionBufferMap,
) {
  return async (event: HookEvent, ctx: HookAgentContext = {}): Promise<void> => {
    console.log("[gralkor] [auto-capture] agent_end fired — agentId:", ctx.agentId, "messageCount:", event.messages?.length ?? 0, "success:", event.success);

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] [auto-capture] disabled, skipping");
      return;
    }

    if (!event.messages || event.messages.length === 0) {
      console.log("[gralkor] [auto-capture] no messages, skipping");
      return;
    }

    const key = resolveBufferKey(ctx);
    const existing = buffers.get(key);
    if (existing) {
      clearTimeout(existing.timer);
    }

    const timer = setTimeout(() => {
      const buf = buffers.get(key);
      if (buf) {
        flushSessionBuffer(key, buf, buffers, client).catch((err) => {
          console.warn("[gralkor] [auto-capture] idle flush failed:", err instanceof Error ? err.message : err);
        });
      }
    }, config.autoCapture.idleTimeoutMs);

    // Prevent timer from keeping the process alive
    if (typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }

    buffers.set(key, {
      messages: event.messages,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
      lastSeenAt: Date.now(),
      flushedMessageCount: existing?.flushedMessageCount ?? 0,
      timer,
    });

    console.log("[gralkor] [auto-capture] buffer updated — key:", key, "messageCount:", event.messages.length);
  };
}

export function createBeforeResetHandler(
  client: GraphitiClient,
  buffers: SessionBufferMap,
) {
  return async (_event: HookEvent, ctx: HookAgentContext = {}): Promise<void> => {
    const key = resolveBufferKey(ctx);
    const buffer = buffers.get(key);
    if (!buffer) {
      console.log("[gralkor] [auto-capture] before_reset — no buffer for key:", key);
      return;
    }

    console.log("[gralkor] [auto-capture] before_reset — flushing key:", key);
    await flushSessionBuffer(key, buffer, buffers, client);
  };
}

export function createSessionEndHandler(
  client: GraphitiClient,
  buffers: SessionBufferMap,
) {
  return async (_event: HookEvent, ctx: HookSessionContext): Promise<void> => {
    const key = resolveBufferKey(ctx);
    const buffer = buffers.get(key);
    if (!buffer) {
      console.log("[gralkor] [auto-capture] session_end — no buffer for key:", key);
      return;
    }

    console.log("[gralkor] [auto-capture] session_end — flushing key:", key);
    await flushSessionBuffer(key, buffer, buffers, client);
  };
}

export function createGatewayStopHandler(
  client: GraphitiClient,
  buffers: SessionBufferMap,
) {
  return async (): Promise<void> => {
    if (buffers.size === 0) {
      console.log("[gralkor] [auto-capture] gateway_stop — no buffers to flush");
      return;
    }

    console.log("[gralkor] [auto-capture] gateway_stop — flushing", buffers.size, "buffer(s)");
    const flushPromises: Promise<void>[] = [];
    for (const [key, buffer] of buffers) {
      flushPromises.push(
        flushSessionBuffer(key, buffer, buffers, client).catch((err) => {
          console.warn("[gralkor] [auto-capture] gateway_stop flush failed for key:", key, err instanceof Error ? err.message : err);
        }),
      );
    }
    await Promise.all(flushPromises);
  };
}
