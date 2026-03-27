import type { GraphitiClient, EpisodeMessage, EpisodeBlock } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId, type ReadyGate } from "./config.js";
import { formatFact } from "./tools.js";

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

/** Tool block type names used by OpenClaw providers. */
const TOOL_BLOCK_TYPES = new Set(["toolCall", "toolUse", "functionCall"]);

/**
 * Check if a content block is a tool call block.
 */
function isToolBlock(block: ContentBlock): boolean {
  return TOOL_BLOCK_TYPES.has(block.type);
}

/**
 * Serialize a tool call block into a human-readable text representation.
 * Field names vary by provider: Anthropic uses `input`, OpenAI uses `arguments`,
 * and some providers use `params`.
 */
function serializeToolBlock(block: ContentBlock): string {
  const name = (block.name as string) || "unknown";
  const input = block.input ?? block.arguments ?? block.params;
  const inputStr = input ? JSON.stringify(input) : "";
  return inputStr ? `Tool: ${name}\nInput: ${inputStr}` : `Tool: ${name}`;
}

/** Maximum characters for tool result text before truncation. */
const TOOL_RESULT_TRUNCATE_LIMIT = 1000;

/**
 * Truncate text to a character limit, appending an indicator if truncated.
 */
function truncateText(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "... (truncated)";
}

/** before_prompt_build event — prompt and messages always present. */
export interface PromptBuildEvent {
  prompt: string;
  messages: MessageEntry[];
}

/** agent_end event — messages always present. */
export interface AgentEndEvent {
  messages: MessageEntry[];
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
 * Extract the user's actual message from event.prompt (before_prompt_build).
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
        .join("\n");
      const cleaned = cleanUserMessageText(text);
      if (cleaned) return cleaned;
    }
  }
  return "";
}

/**
 * System message detectors — content matching any pattern is dropped entirely.
 * OpenClaw injects system content under user/assistant roles (session
 * notifications, timestamps, startup instructions). These patterns detect
 * those injections so extractMessagesFromCtx can drop them before ingestion.
 *
 * When a new runtime-injected pattern appears, add it here rather than
 * writing bespoke stripping logic.
 */
const SYSTEM_MESSAGE_PATTERNS: RegExp[] = [
  /^A new session was started\b/,
  /^Current time:/i,
  /^✅?\s*New session started\b/,
];

/**
 * Returns true if the text is a system-injected message.
 */
function isSystemMessage(text: string): boolean {
  const trimmed = text.trim();
  return !trimmed || SYSTEM_MESSAGE_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Detect system-injected user messages and extract real user content.
 *
 * Messages matching SYSTEM_MESSAGE_PATTERNS are dropped entirely.
 * Metadata wrappers and gralkor-memory XML are unwrapped because they
 * surround real user content.
 *
 * Returns the user's text, or empty string if the message is a system message.
 */
function cleanUserMessageText(text: string): string {
  if (isSystemMessage(text)) return "";

  // Unwrap metadata wrappers (they surround real user content)
  let cleaned = text.replace(
    /[^\n]+\(untrusted metadata\):\n```json\n[\s\S]*?\n```\n\n/g,
    "",
  );

  // Remove gralkor-memory XML (feedback loop prevention)
  cleaned = cleaned.replace(/<gralkor-memory[\s\S]*?<\/gralkor-memory>\n*/g, "");

  return cleaned.trim();
}

/**
 * Extract and filter messages for episode ingestion.
 *
 * Filters the raw OpenClaw message array down to user and assistant messages
 * with only text/output_text/thinking blocks. Cleans user messages of system
 * noise (session-start instructions, metadata wrappers, gralkor-memory XML).
 * Serializes toolCall/toolUse/functionCall blocks as tool_use blocks.
 * Converts toolResult messages to assistant messages with truncated tool_result blocks.
 *
 * The server handles transcript formatting and thinking distillation.
 */
export function extractMessagesFromCtx(event: HookEvent): EpisodeMessage[] {
  const messages = event.messages;
  if (!messages || !Array.isArray(messages)) return [];

  const result: EpisodeMessage[] = [];

  for (const msg of messages) {
    const blocks = normalizeContent(msg.content);

    if (msg.role === "user") {
      const textParts = blocks
        .filter(isTextBlock)
        .map((block: ContentBlock) => block.text!)
        .join("\n");

      if (!textParts) continue;

      const cleanText = cleanUserMessageText(textParts);
      if (!cleanText) continue;

      result.push({ role: "user", content: [{ type: "text", text: cleanText }] });
    } else if (msg.role === "assistant") {
      const filtered: EpisodeBlock[] = [];
      for (const block of blocks) {
        if (isThinkingBlock(block)) {
          filtered.push({ type: "thinking", text: block.thinking as string });
        } else if (isToolBlock(block)) {
          filtered.push({ type: "tool_use", text: serializeToolBlock(block) });
        } else if (isTextBlock(block)) {
          if (!isSystemMessage(block.text!)) {
            filtered.push({ type: "text", text: block.text! });
          }
        }
      }
      if (filtered.length > 0) {
        result.push({ role: "assistant", content: filtered });
      }
    } else if (msg.role === "toolResult") {
      const textParts = blocks
        .filter(isTextBlock)
        .map((block: ContentBlock) => block.text!)
        .join("\n");
      if (textParts) {
        result.push({
          role: "assistant",
          content: [{ type: "tool_result", text: truncateText(textParts, TOOL_RESULT_TRUNCATE_LIMIT) }],
        });
      }
    }
  }

  return result;
}

/**
 * Count actual results in a native search response.
 * Native memory_search returns JSON with metadata even when results are empty:
 *   { "results": [], "provider": "...", ... }
 * For non-JSON strings, returns 1 if non-empty (opaque content).
 */
export function countNativeResults(nativeResult: string | null): number {
  if (!nativeResult) return 0;
  try {
    const parsed = JSON.parse(nativeResult);
    return Array.isArray(parsed.results) ? parsed.results.length : 0;
  } catch {
    return nativeResult.trim().length > 0 ? 1 : 0;
  }
}

export type NativeSearchFn = (query: string) => Promise<string>;

export interface RecallOpts {
  setGroupId?: (id: string) => void;
  getNativeSearch?: () => NativeSearchFn | null;
  serverReady?: ReadyGate;
}

export function createBeforePromptBuildHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  opts: RecallOpts = {},
) {
  const { setGroupId, getNativeSearch, serverReady } = opts;

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

    const groupId = resolveGroupId({ agentId });

    try {
      const limit = config.autoRecall.maxResults;

      if (serverReady && !serverReady.isReady()) {
        throw new Error("[gralkor] auto-recall failed: server is not ready");
      }

      const nativeSearch = getNativeSearch?.();
      const [searchResults, nativeResult] = await Promise.all([
        client.search(userMessage, [groupId], limit),
        nativeSearch ? nativeSearch(userMessage) : Promise.resolve(null),
      ]);

      const factCount = searchResults.facts.length;
      const nativeCount = countNativeResults(nativeResult);
      console.log(`[gralkor] auto-recall result — graph: ${factCount} facts, native: ${nativeCount} results — groupId:${groupId}`);

      const sections: string[] = [];

      if (factCount > 0) {
        sections.push("Facts from knowledge graph:\n" + searchResults.facts.map(formatFact).join("\n"));
      } else {
        sections.push("No facts found.");
      }

      if (nativeCount > 0 && nativeResult) {
        sections.push("From native memory:\n" + nativeResult);
      } else {
        sections.push("No native results.");
      }

      const instructions =
        "Before responding, search memory 2-3 times in parallel with different queries to surface relevant context " +
        "(e.g. key entities or people mentioned, the topic being discussed, related projects or goals).";

      const prependContext = `<gralkor-memory source="auto-recall" trust="untrusted">\n${sections.join("\n\n")}\n\n${instructions}\n</gralkor-memory>`;

      if (config.test) {
        console.log(`[gralkor] [test] auto-recall context:\n${prependContext}`);
      }

      return { prependContext };
    } catch (err) {
      console.error("[gralkor] auto-recall failed:", err instanceof Error ? err.message : err);
      throw err;
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
 * Keyed debouncer: stores a value per key and flushes it after idle timeout.
 * Each `set()` resets the timer. `flush()` forces immediate delivery.
 * At most one flush per key — whichever fires first (idle or explicit) wins.
 */
export class DebouncedFlush<T> {
  private entries = new Map<string, T>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private delayMs: number,
    private onFlush: (key: string, value: T) => Promise<void>,
  ) {}

  set(key: string, value: T): void {
    this.entries.set(key, value);
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.timers.delete(key);
      const val = this.entries.get(key);
      if (!val) return;
      this.entries.delete(key);
      this.onFlush(key, val).catch(() => {});
    }, this.delayMs);
    timer.unref();
    this.timers.set(key, timer);
  }

  async flush(key: string): Promise<void> {
    const timer = this.timers.get(key);
    if (timer) { clearTimeout(timer); this.timers.delete(key); }
    const val = this.entries.get(key);
    if (!val) return;
    this.entries.delete(key);
    await this.onFlush(key, val);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get pendingCount(): number {
    return this.entries.size;
  }

  get timerCount(): number {
    return this.timers.size;
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.entries.clear();
  }
}

/**
 * Flush a session buffer → episode. Retries up to 3 times with exponential backoff.
 */
export async function flushSessionBuffer(
  key: string,
  buffer: SessionBuffer,
  client: GraphitiClient,
  { retryDelayMs = 1000, test }: { retryDelayMs?: number; test?: boolean } = {},
): Promise<void> {
  const filtered = extractMessagesFromCtx({ messages: buffer.messages });
  if (filtered.length === 0) {
    console.log(`[gralkor] auto-capture flush skip (empty) — key:${key}`);
    return;
  }

  const groupId = resolveGroupId({ agentId: buffer.agentId });
  const userFiltered = filtered.filter(m => m.role === "user").length;
  const assistantFiltered = filtered.filter(m => m.role === "assistant").length;
  const assistantBlocks = filtered.filter(m => m.role === "assistant").flatMap(m => m.content);
  const thinkingBlockCount = assistantBlocks.filter(b => b.type === "thinking").length;
  const toolUseBlockCount = assistantBlocks.filter(b => b.type === "tool_use").length;
  const toolResultBlockCount = assistantBlocks.filter(b => b.type === "tool_result").length;
  const textBlockCount = filtered.reduce((sum, m) => sum + m.content.filter(b => b.type === "text").length, 0);
  const totalChars = filtered.reduce((sum, m) => sum + m.content.reduce((s, b) => s + b.text.length, 0), 0);

  console.log(`[gralkor] auto-capture flushing — key:${key} groupId:${groupId} messages:${filtered.length} (user:${userFiltered} assistant:${assistantFiltered} textBlocks:${textBlockCount} thinkingBlocks:${thinkingBlockCount} toolUseBlocks:${toolUseBlockCount} toolResultBlocks:${toolResultBlockCount} chars:${totalChars})`);

  if (test) {
    console.log(`[gralkor] [test] episode messages:\n${JSON.stringify(filtered, null, 2)}`);
  }

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const flushStart = Date.now();
      await client.ingestMessages({
        name: `conversation-${Date.now()}`,
        source_description: "auto-capture",
        group_id: groupId,
        messages: filtered,
      });
      const flushDuration = Date.now() - flushStart;

      console.log(`[gralkor] auto-capture flushed — key:${key} duration:${flushDuration}ms`);
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
  config: GralkorConfig,
  debouncer: DebouncedFlush<SessionBuffer>,
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

    const userCount = event.messages.filter(m => m.role === "user").length;
    const assistantCount = event.messages.filter(m => m.role === "assistant").length;
    const assistantBlocksRaw = event.messages
      .filter(m => m.role === "assistant")
      .flatMap(m => normalizeContent(m.content));
    const thinkingBlocks = assistantBlocksRaw.filter(isThinkingBlock).length;
    const toolBlocks = assistantBlocksRaw.filter(isToolBlock).length;
    const toolResultCount = event.messages.filter(m => m.role === "toolResult").length;

    debouncer.set(key, {
      messages: event.messages,
      agentId: ctx.agentId,
      sessionKey: ctx.sessionKey,
    });

    console.log(`[gralkor] auto-capture buffered — key:${key} total:${event.messages.length} user:${userCount} assistant:${assistantCount} thinkingBlocks:${thinkingBlocks} toolBlocks:${toolBlocks} toolResults:${toolResultCount}`);
  };
}


export function createSessionEndHandler(
  debouncer: DebouncedFlush<SessionBuffer>,
) {
  return async (_event: HookEvent, ctx: HookSessionContext): Promise<void> => {
    const key = resolveBufferKey(ctx);
    if (!debouncer.has(key)) {
      console.log(`[gralkor] session_end — no buffer for key:${key}`);
      return;
    }

    console.log(`[gralkor] session_end flush — key:${key}`);
    await debouncer.flush(key);
  };
}

