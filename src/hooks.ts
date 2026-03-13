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
  content: string | ContentBlock[];
}

/**
 * Normalize message content to a ContentBlock array.
 *
 * UserMessage.content may be a plain string at runtime (OpenClaw's
 * AgentMessage union). Convert it to a single text block so downstream
 * code can always use array methods.
 */
function normalizeContent(content: string | ContentBlock[] | undefined): ContentBlock[] {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}

/**
 * Check if a content block contains extractable text.
 * Matches both standard "text" blocks and the "output_text" variant
 * emitted by some providers.
 */
function isTextBlock(block: ContentBlock): boolean {
  return (block.type === "text" || block.type === "output_text") && !!block.text;
}

/**
 * Check if a content block is a thinking block with content.
 */
function isThinkingBlock(block: ContentBlock): boolean {
  return block.type === "thinking" && !!(block.thinking as string | undefined);
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
      const text = normalizeContent(messages[i].content)
        .filter(isTextBlock)
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
 * For user messages, we extract text blocks as before.
 * For assistant messages, we iterate blocks individually:
 *   - text/output_text → "Assistant: {text}"
 *   - thinking → "Assistant: (thinking: {text})" truncated to maxThinkingChars
 *   - toolCall/toolUse/functionCall → skipped
 *
 * Returns a multi-turn conversation string:
 *   "User: ...\nAssistant: ...\nUser: ...\nAssistant: ..."
 */
export function extractMessagesFromCtx(
  event: HookEvent,
  { maxThinkingChars = 2000 }: { maxThinkingChars?: number } = {},
): string {
  const messages = event.messages;
  if (!messages || !Array.isArray(messages)) return "";

  const parts: string[] = [];

  for (const msg of messages) {
    const blocks = normalizeContent(msg.content);

    if (msg.role === "user") {
      const textParts = blocks
        .filter(isTextBlock)
        .map((block: ContentBlock) => block.text!)
        .join("\n");

      if (!textParts) continue;

      const cleanText = textParts
        .replace(/<gralkor-memory[\s\S]*?<\/gralkor-memory>\n*/g, "")
        .trim();

      if (cleanText) {
        parts.push(`User: ${cleanText}`);
      }
    } else if (msg.role === "assistant") {
      for (const block of blocks) {
        if (isThinkingBlock(block)) {
          let thinking = block.thinking as string;
          if (thinking.length > maxThinkingChars) {
            thinking = thinking.slice(0, maxThinkingChars) + "...";
          }
          parts.push(`Assistant: (thinking: ${thinking})`);
        } else if (isTextBlock(block)) {
          parts.push(`Assistant: ${block.text!}`);
        }
      }
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
    const agentId = ctx.agentId;
    console.log(`[gralkor] auto-recall — agentId:${agentId} promptLen:${event.prompt?.length ?? 0} messages:${event.messages?.length ?? 0}`);

    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log(`[gralkor] auto-recall skip (disabled) — agentId:${agentId}`);
      return;
    }

    const userMessage = extractUserMessageFromPrompt(event);
    if (!userMessage) {
      console.log(`[gralkor] auto-recall skip (no query) — agentId:${agentId} promptLen:${event.prompt?.length ?? 0} messages:${event.messages?.length ?? 0}`);
      return;
    }

    // Deduplicate: if we searched for the same query within 5s, return cached result.
    // This prevents the double-fire from doubling API calls.
    const now = Date.now();
    if (userMessage === lastQuery && now - lastResultAt < 5_000) {
      console.log(`[gralkor] auto-recall dedup — agentId:${agentId}`);
      return lastResult;
    }

    const groupId = resolveGroupId({ agentId });

    try {
      const limit = config.autoRecall.maxResults;

      // Search graph and native markdown in parallel
      const nativeSearch = getNativeSearch?.();
      const [searchResults, nativeResult] = await Promise.all([
        client.search(userMessage, [groupId], limit),
        nativeSearch ? nativeSearch(userMessage).catch((err: unknown) => {
          console.warn("[gralkor] auto-recall native failed:", err instanceof Error ? err.message : err);
          return null;
        }) : Promise.resolve(null),
      ]);

      const nativeLen = nativeResult?.length ?? 0;
      console.log(`[gralkor] auto-recall result — ${searchResults.facts.length} facts, ${nativeLen} native chars — groupId:${groupId}`);

      const sections: string[] = [];

      if (searchResults.facts.length > 0) {
        sections.push("Facts from knowledge graph:\n" + searchResults.facts.map((f) => `- ${f.fact}`).join("\n"));
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

      if (config.test) {
        console.log(`[gralkor] [test] auto-recall context:\n${prependContext}`);
      }

      const result = { prependContext };
      lastQuery = userMessage;
      lastResult = result;
      lastResultAt = now;

      return result;
    } catch (err) {
      console.warn("[gralkor] auto-recall failed:", err instanceof Error ? err.message : err);
      return;
    }
  };
}

/**
 * Session buffer entry — holds the latest message snapshot for a session,
 * flushed as a single episode on session boundary events.
 */
export interface SessionBuffer {
  messages: MessageEntry[];
  agentId?: string;
  sessionKey?: string;
}

export type SessionBufferMap = Map<string, SessionBuffer>;

export type IdleTimerMap = Map<string, ReturnType<typeof setTimeout>>;

export function clearIdleTimers(timers: IdleTimerMap): void {
  for (const timer of timers.values()) {
    clearTimeout(timer);
  }
  timers.clear();
}

function resolveBufferKey(ctx: { sessionKey?: string; agentId?: string }): string {
  return ctx.sessionKey || ctx.agentId || "default";
}

/**
 * Returns true if the error is retryable (not a 4xx client error).
 */
function isRetryableError(err: unknown): boolean {
  if (err instanceof Error && /returned 4\d{2}:/.test(err.message)) return false;
  return true;
}

/**
 * Flush a single session buffer → episode, then delete it from the map.
 * Called by session_end handler. Retries up to 3 times with exponential backoff.
 */
export async function flushSessionBuffer(
  key: string,
  buffer: SessionBuffer,
  buffers: SessionBufferMap,
  client: GraphitiClient,
  { retryDelayMs = 1000, maxThinkingChars, test }: { retryDelayMs?: number; maxThinkingChars?: number; test?: boolean } = {},
): Promise<void> {
  const conversation = extractMessagesFromCtx({ messages: buffer.messages }, { maxThinkingChars });
  if (!conversation) {
    console.log(`[gralkor] auto-capture flush skip (empty) — key:${key}`);
    buffers.delete(key);
    return;
  }

  const groupId = resolveGroupId({ agentId: buffer.agentId });
  console.log(`[gralkor] auto-capture flushing — key:${key} groupId:${groupId} bodySize:${conversation.length}`);

  if (test) {
    console.log(`[gralkor] [test] episode body:\n${conversation}`);
  }

  // Remove buffer before API call so errors don't leave stale entries
  buffers.delete(key);

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.addEpisode({
        name: `conversation-${Date.now()}`,
        episode_body: conversation,
        source_description: "auto-capture",
        group_id: groupId,
      });

      console.log(`[gralkor] auto-capture flushed — key:${key}`);
      return;
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries && isRetryableError(err)) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        console.warn(`[gralkor] auto-capture flush attempt ${attempt + 1} failed, retrying in ${delay}ms: ${err instanceof Error ? err.message : err}`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`[gralkor] auto-capture flush failed after ${attempt + 1} attempts — key:${key}: ${err instanceof Error ? err.message : err}`);
        break;
      }
    }
  }

  throw lastError;
}

export function createAgentEndHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  buffers: SessionBufferMap,
  timers?: IdleTimerMap,
) {
  return async (event: HookEvent, ctx: HookAgentContext = {}): Promise<void> => {
    console.log(`[gralkor] agent_end — agentId:${ctx.agentId} messages:${event.messages?.length ?? 0} success:${event.success}`);

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] agent_end skip (disabled)");
      return;
    }

    if (!event.messages || event.messages.length === 0) {
      console.log(`[gralkor] agent_end skip (no messages) — agentId:${ctx.agentId}`);
      return;
    }

    const key = resolveBufferKey(ctx);

    buffers.set(key, {
      messages: event.messages,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
    });

    console.log(`[gralkor] auto-capture buffered — key:${key} messages:${event.messages.length}`);

    // Reset idle timer for this buffer key
    if (timers) {
      const existingTimer = timers.get(key);
      if (existingTimer) clearTimeout(existingTimer);

      const timer = setTimeout(() => {
        timers.delete(key);
        const buf = buffers.get(key);
        if (!buf) {
          console.log(`[gralkor] auto-capture idle no-op — key:${key}`);
          return;
        }
        console.log(`[gralkor] auto-capture idle flush — key:${key}`);
        flushSessionBuffer(key, buf, buffers, client, { maxThinkingChars: config.autoCapture.maxThinkingChars, test: config.test }).catch((err) => {
          console.warn("[gralkor] auto-capture idle flush failed:", err instanceof Error ? err.message : err);
        });
      }, config.idleTimeoutMs);

      timer.unref();
      timers.set(key, timer);
    }
  };
}


export function createSessionEndHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  buffers: SessionBufferMap,
  timers?: IdleTimerMap,
) {
  return async (_event: HookEvent, ctx: HookSessionContext): Promise<void> => {
    const key = resolveBufferKey(ctx);
    const buffer = buffers.get(key);
    if (!buffer) {
      console.log(`[gralkor] session_end — no buffer for key:${key}`);
      return;
    }

    // Cancel idle timer — session_end wins the race
    if (timers) {
      const timer = timers.get(key);
      if (timer) {
        clearTimeout(timer);
        timers.delete(key);
      }
    }

    console.log(`[gralkor] session_end flush — key:${key}`);
    flushSessionBuffer(key, buffer, buffers, client, { maxThinkingChars: config.autoCapture.maxThinkingChars, test: config.test }).catch((err) => {
      console.warn("[gralkor] session_end flush failed:", err instanceof Error ? err.message : err);
    });
  };
}

