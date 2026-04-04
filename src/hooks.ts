import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { type ReadyGate, sanitizeGroupId } from "./config.js";
import { formatFact, INTERPRETATION_INSTRUCTION } from "./tools.js";
import { type EpisodeMessage, type EpisodeBlock, formatTranscript } from "./distill.js";
import type { LLMClient, LLMMessage } from "./llm-client.js";

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
 * Extract the user's actual message from event.prompt.
 *
 * The prompt may be wrapped in metadata:
 *   "Sender (untrusted metadata):\n```json\n{...}\n```\n\nActual message"
 *
 * System prompts (e.g. "A new session was started via /new") are not user messages.
 */
export function extractUserMessageFromPrompt(event: PromptBuildEvent): string {
  // Strip leading "System: ..." lines (queued events prepended by gateway)
  const stripped = event.prompt.replace(/^(?:System: [^\n]*\n\n)+/, "");

  // Strip session-start system instruction (may have user message after it)
  const afterSession = stripped.replace(/^A new session was started[^\n]*(?:\n\n)?/, "");
  if (!afterSession) return "";

  // Strip metadata wrapper if present
  const metadataPattern = /^.+?\(untrusted metadata\):\n```json\n[\s\S]*?\n```\n\n/;
  const fromPrompt = afterSession.replace(metadataPattern, "").trim();
  if (fromPrompt) return fromPrompt;

  // Prompt was only metadata wrapper — extract from messages instead.
  return extractLastUserMessageFromMessages(event.messages);
}

/**
 * Extract the last user message text from the messages array.
 * Used as fallback when the prompt contains only metadata wrapper.
 */
export function extractLastUserMessageFromMessages(messages: MessageEntry[]): string {
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
  /^System: /,
  /^\[User sent media without caption\]$/,
];

/**
 * Returns true if the text is a system-injected message.
 */
function isSystemMessage(text: string): boolean {
  const trimmed = text.trim();
  return !trimmed || SYSTEM_MESSAGE_PATTERNS.some((p) => p.test(trimmed));
}

/**
 * Returns true if a single non-empty line matches a system pattern.
 * Unlike isSystemMessage, does NOT treat empty/whitespace as system content —
 * preserves paragraph breaks when filtering line-by-line.
 */
function isSystemLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed !== "" && SYSTEM_MESSAGE_PATTERNS.some((p) => p.test(trimmed));
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
  if (!text.trim()) return "";

  // Unwrap metadata wrappers (they surround real user content)
  let cleaned = text.replace(
    /[^\n]+\(untrusted metadata\):\n```json\n[\s\S]*?\n```\n\n/g,
    "",
  );

  // Remove gralkor-memory XML (feedback loop prevention)
  cleaned = cleaned.replace(/<gralkor-memory[\s\S]*?<\/gralkor-memory>\n*/g, "");

  // Remove Untrusted context footer (appended by OpenClaw's appendUntrustedContext)
  cleaned = cleaned.replace(/\n*Untrusted context \(metadata[^)]*\):\n[\s\S]*$/, "");

  // Strip individual system lines (session-start, Current time, etc.)
  cleaned = cleaned
    .split("\n")
    .filter((line) => !isSystemLine(line))
    .join("\n")
    .trim();

  return cleaned;
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
export function extractMessagesFromCtx(event: AgentEndEvent): EpisodeMessage[] {
  const result: EpisodeMessage[] = [];

  for (const msg of event.messages) {
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
    } else if (msg.role === "toolResult" || msg.role === "tool") {
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
export interface RecallOpts {
  setGroupId?: (id: string) => void;
  serverReady?: ReadyGate;
  llmClient?: LLMClient | null;
}

const INTERPRET_SYSTEM_PROMPT =
  "You are reviewing recalled memory facts for an agent mid-conversation. " +
  "Given the conversation so far and the facts retrieved from memory, identify " +
  "which facts are relevant to the current task and explain concisely how each " +
  "one helps. Skip facts with no bearing on the current task. " +
  "Be direct — one sentence per fact. Output only the interpretation, nothing else.";

const INTERPRET_CONTEXT_LIMIT = 20;

function buildInterpretationContext(messages: MessageEntry[], factsText: string): string {
  const recent = messages.slice(-INTERPRET_CONTEXT_LIMIT);
  const lines: string[] = [];
  for (const msg of recent) {
    const blocks = normalizeContent(msg.content);
    const text = blocks.filter(isTextBlock).map((b: ContentBlock) => b.text!).join(" ");
    const cleaned = msg.role === "user" ? cleanUserMessageText(text) : text.trim();
    if (!cleaned) continue;
    const role = msg.role === "user" ? "User" : "Assistant";
    lines.push(`${role}: ${cleaned}`);
  }
  return `Conversation context:\n${lines.join("\n")}\n\nMemory facts to interpret:\n${factsText}`;
}

export function createBeforePromptBuildHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  opts: RecallOpts = {},
) {
  const { setGroupId, serverReady, llmClient } = opts;

  return async (event: PromptBuildEvent, ctx: HookAgentContext = {}): Promise<{ prependContext?: string } | void> => {
    const agentId = ctx.agentId;
    console.log(`[gralkor] auto-recall — agentId:${agentId} promptLen:${event.prompt.length} messages:${event.messages.length}`);

    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log(`[gralkor] auto-recall skip (disabled) — agentId:${agentId}`);
      return;
    }

    const userMessage = extractUserMessageFromPrompt(event);
    if (!userMessage) {
      console.log(`[gralkor] auto-recall skip (no query) — agentId:${agentId} promptLen:${event.prompt.length} messages:${event.messages.length}`);
      return;
    }

    const groupId = sanitizeGroupId(agentId ?? "default");

    try {
      const limit = config.autoRecall.maxResults;

      if (serverReady && !serverReady.isReady()) {
        throw new Error("server is not ready (service start() may not have been called by host)");
      }

      const searchResults = await client.search(userMessage, [groupId], limit, "fast");
      const factCount = searchResults.facts.length;
      console.log(`[gralkor] auto-recall result — graph: ${factCount} facts — groupId:${groupId}`);

      const factsText = factCount > 0
        ? "Facts:\n" + searchResults.facts.map(formatFact).join("\n")
        : "No facts found.";

      const furtherQuerying =
        "Then, search memory up to 3 times in parallel with diverse queries to understand more deeply.";

      let contextBody = factsText;
      let interpretationSucceeded = false;

      if (factCount > 0 && llmClient) {
        try {
          const interpretCtx = buildInterpretationContext(event.messages, factsText);
          const interpretMessages: LLMMessage[] = [
            { role: "system", content: INTERPRET_SYSTEM_PROMPT },
            { role: "user", content: interpretCtx },
          ];
          const interpretation = await llmClient.generate(interpretMessages, 500);
          if (interpretation) {
            contextBody = `${factsText}\n\nInterpretation:\n${interpretation}`;
            interpretationSucceeded = true;
            console.log(`[gralkor] auto-recall interpretation — chars:${interpretation.length}`);
          }
        } catch (err) {
          console.warn("[gralkor] auto-recall interpretation failed, using fallback:", err instanceof Error ? err.message : err);
        }
      }

      const trailer = interpretationSucceeded
        ? furtherQuerying
        : `${INTERPRETATION_INSTRUCTION} ${furtherQuerying}`;

      const prependContext = `<gralkor-memory source="auto-recall" trust="untrusted">\n${contextBody}\n\n${trailer}\n</gralkor-memory>`;

      if (config.test) {
        console.log(`[gralkor] [test] auto-recall query: ${userMessage}`);
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
      this.onFlush(key, val);
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

  async flushAll(): Promise<void> {
    const keys = [...this.entries.keys()];
    await Promise.allSettled(keys.map(key => this.flush(key)));
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
 * Flush a session buffer → episode. Distils behaviour blocks via LLM before sending.
 * Retries up to 3 times with exponential backoff.
 */
export async function flushSessionBuffer(
  key: string,
  buffer: SessionBuffer,
  client: GraphitiClient,
  { retryDelayMs = 1000, test, llmClient = null }: {
    retryDelayMs?: number;
    test?: boolean;
    llmClient?: LLMClient | null;
  } = {},
): Promise<void> {
  const filtered = extractMessagesFromCtx({ messages: buffer.messages });
  if (filtered.length === 0) {
    console.log(`[gralkor] auto-capture flush skip (empty) — key:${key}`);
    return;
  }

  const groupId = sanitizeGroupId(buffer.agentId ?? "default");
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

  const episodeBody = await formatTranscript(filtered, llmClient);

  if (test) {
    console.log(`[gralkor] [test] episode body:\n${episodeBody}`);
  }

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const flushStart = Date.now();
      await client.ingestEpisode({
        name: `conversation-${Date.now()}`,
        source_description: "auto-capture",
        group_id: groupId,
        episode_body: episodeBody,
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
        console.error(`[gralkor] auto-capture flush failed after ${attempt + 1} attempts (message dropped) — key:${key}: ${err instanceof Error ? err.message : err}`);
        return;
      }
    }
  }
}

export function createAgentEndHandler(
  config: GralkorConfig,
  debouncer: DebouncedFlush<SessionBuffer>,
) {
  return async (event: AgentEndEvent, ctx: HookAgentContext = {}): Promise<void> => {
    console.log(`[gralkor] agent_end — agentId:${ctx.agentId} messages:${event.messages.length} success:${event.success}`);

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] agent_end skip (disabled)");
      return;
    }

    if (event.messages.length === 0) {
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
  return async (_event: unknown, ctx: HookSessionContext): Promise<void> => {
    const key = resolveBufferKey(ctx);
    if (!debouncer.has(key)) {
      console.log(`[gralkor] session_end — no buffer for key:${key}`);
      return;
    }

    console.log(`[gralkor] session_end flush — key:${key}`);
    await debouncer.flush(key);
  };
}

