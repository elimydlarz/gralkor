# `agent_end` Messages Array — Detailed Guide

## Overview

The `event.messages` field in `agent_end` is typed as `unknown[]` in the hook signature (`PluginHookAgentEndEvent`), but the actual runtime type is `AgentMessage[]` from `@mariozechner/pi-agent-core`. It's a snapshot of the **entire session transcript** at the end of the agent turn — not just the current turn's messages.

The type is a discriminated union on the `role` field with three variants:

---

## 1. `UserMessage` (`role: "user"`)

```typescript
{
  role: "user";
  content: string;         // plain text (may also be ContentBlock[] for multimodal)
  timestamp: number;       // epoch ms
}
```

The user's input. Content is usually a string, but can be a content block array when images are attached. Always the start of a turn.

---

## 2. `AssistantMessage` (`role: "assistant"`)

```typescript
{
  role: "assistant";
  content: ContentBlock[];   // array of text, tool_use, thinking blocks
  stopReason: StopReason;    // why the LLM stopped
  api: string;               // e.g. "openai-responses", "anthropic-messages"
  provider: string;          // e.g. "openai", "anthropic", "google"
  model: string;             // model ID
  usage?: Usage;             // token counts + cost
  timestamp: number;
  errorMessage?: string;     // present when stopReason is "error"
}
```

### `stopReason` values

`"stop"` | `"toolUse"` | `"error"` | `"aborted"` | `"length"` | `"other"`

Within a single agent turn (user message → response), the transcript contains **multiple assistant messages** with different `stopReason` values as the agent loops through tool calls:

```
assistant  stopReason:"toolUse"   [thinking("..."), toolCall("bash", ...)]
toolResult                        [text("...")]
assistant  stopReason:"toolUse"   [thinking("..."), toolCall("read", ...)]
toolResult                        [text("...")]
assistant  stopReason:"stop"      [thinking("..."), text("Here's what I found")]
```

- `"toolUse"` — intermediate steps where the agent called tools and paused for results
- `"stop"` — final response; the agent chose to stop and respond to the user
- `"length"` — token limit hit mid-generation
- `"error"` / `"aborted"` — generation failed or was interrupted; tool call blocks may be incomplete (no matching results)

### Content block types

| Block type | Fields | Notes |
|---|---|---|
| **Text** | `{ type: "text", text: string, textSignature?: string }` | The agent's natural language output |
| **Tool call** | `{ type: "toolCall" \| "toolUse" \| "functionCall", id: string, name: string, input?: object, arguments?: object }` | Intent to invoke a tool. `input` (Anthropic-style) or `arguments` (OpenAI-style) — check both. `id` links to the matching `toolResult` |
| **Thinking** | `{ type: "thinking", thinking: string, thinkingSignature?: string }` | Reasoning traces (extended thinking / chain-of-thought) |

> A single assistant message can contain multiple text and tool_use blocks interleaved — the agent may reason, call a tool, reason more, call another tool, all in one message.

### `Usage` object

```typescript
{
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}
```

---

## 3. `ToolResultMessage` (`role: "toolResult"`)

```typescript
{
  role: "toolResult";
  toolCallId: string;       // matches the tool call block's `id`
  toolName: string;         // which tool was executed
  content: ContentBlock[];  // result content (text, image, output_text blocks)
  isError: boolean;         // whether execution failed
  timestamp: number;
  toolUseId?: string;       // legacy/alternative ID field
  details?: unknown;        // extended result data (stripped before sending to LLM)
}
```

### Result content block types

| Block type | Fields | Notes |
|---|---|---|
| **Text** | `{ type: "text", text: string }` | Most common — command output, file contents, search results |
| **Image** | `{ type: "image", data: string, mimeType?: string }` | Base64 image (screenshots, generated images) |
| **Output text** | `{ type: "output_text", text: string }` | Alternative text format from some providers |

---

## Message Ordering

The transcript follows a strict pattern enforced by `session-transcript-repair.ts`:

```
user        -> "Fix the login bug"
assistant   -> [text("Let me check the auth code"), tool_use("bash", {command: "grep..."})]
toolResult  -> [text("src/auth.ts:42: ...")]
toolResult  -> [text("...")] (if multiple tool calls)
assistant   -> [text("Found it, let me fix..."), tool_use("edit", {...})]
toolResult  -> [text("File updated")]
assistant   -> [text("Done. The issue was...")]
user        -> "Thanks, now run the tests"
...
```

**Rules:**

- `toolResult` messages must immediately follow their matching assistant message
- Each `toolResult.toolCallId` matches exactly one `tool_use` block's `id` in the preceding assistant message
- Orphaned or displaced tool results are dropped/repaired
- When `stopReason` is `"error"` or `"aborted"`, `tool_use` blocks may be incomplete (no matching results expected)

---

## Pairing Tool Calls to Results

The link is `assistant.content[n].id` -> `toolResult.toolCallId`:

```typescript
// From an assistant message's content array:
{ type: "toolCall", id: "toolu_01abc", name: "bash", input: { command: "git status" } }

// Matched by the following toolResult:
{ role: "toolResult", toolCallId: "toolu_01abc", toolName: "bash", content: [...] }
```

Use `extractToolCallsFromAssistant()` from `src/agents/tool-call-id.ts` to get `{ id, name }[]` from an assistant message, and `extractToolResultId()` to get the ID from a tool result.

> **Note:** The `id` format varies by provider (Anthropic uses `toolu_*`, OpenAI uses alphanumeric, Mistral requires exactly 9 chars). The IDs are sanitized for cross-provider compatibility but the original IDs are preserved in the session transcript.

---

## Analysis for Graphiti Ingestion

### High value — always ingest

- **User messages** — the intent, the task, what the human cares about
- **Assistant text blocks** — reasoning, decisions, explanations, conclusions. This is where the agent contextualises everything

### The thinking block problem

Thinking blocks contain a mix of:
1. **Genuine reasoning** — domain insights, architectural decisions, connecting concepts, conclusions about the codebase
2. **Operational narration** — "Let me search for...", "The tool results show...", "I should use Read to..." — meta-commentary about the process of using tools

When operational narration gets ingested into Graphiti, it creates facts like "Agent received search results about X" or "Agent searched for Y" — which get recalled as if they're meaningful memories, polluting future context.

**Filtering by `stopReason` doesn't fully solve this.** While `stopReason: "toolUse"` messages are *mostly* operational, they also contain the agent's reasoning about *why* it's taking an action and *what* it expects to find — which are the agent's actions and decisions worth remembering. Dropping all intermediate thinking loses the narrative of what the agent did and why.

**Open problem:** How to separate "I'm going to edit src/auth.ts to fix the null check because the user's error trace points here" (valuable — a decision and its rationale) from "Let me use the Read tool to check this file" (noise — operational mechanics). Both live in thinking blocks on `stopReason: "toolUse"` messages. Possible approaches:

- **LLM summarization at flush time** — most accurate, but adds cost/latency/dependency on the write path
- **Keyword heuristics** — fragile across models, constant maintenance
- **Hybrid stopReason + length threshold** — always include `"stop"`/`"length"` thinking; for `"toolUse"` messages, only include thinking blocks above N chars (short ones tend to be "let me search...", longer ones contain real reasoning). Simple but lossy.

### Tool calls — skip raw, but the actions matter

Raw tool call blocks (`toolCall`/`toolUse`/`functionCall`) and their `toolResult` messages are too programmatic for this memory system — serialized arguments, raw command output, file contents dumps. **Skip these.**

However, the agent's *actions* (what it did and why) are high-value. These are described in:
- **Thinking blocks** adjacent to tool calls (see problem above)
- **Text blocks** in intermediate and final assistant messages — when the agent narrates what it's doing ("Let me check the auth code", "Found it, here's the fix")

The challenge is capturing the agent's action narrative without the raw programmatic data or meta-noise.

### Selective / summarize

- **`toolResult` where `isError: true`** — failures are high-signal, but should be captured via the agent's text/thinking reaction to the failure, not the raw error output
- **Large `toolResult` content** (file reads, long command output) — the assistant's subsequent text block usually summarizes the relevant parts. Skip the raw results.

### Always skip

- **Raw tool call blocks** — programmatic, not semantic
- **Raw `toolResult` content** — the agent's text response already distils what mattered
- **`usage` / `api` / `provider` / `model` metadata** — operational, not semantic
- **`details` field on `toolResult`** — extended data that's stripped before the LLM sees it anyway
- **`textSignature` / `thinkingSignature`** — provider metadata for caching, not content

> **Gotcha:** Since `messages` is the full session snapshot (not just the current turn), you need to track your buffer offset to avoid re-ingesting the same messages on every `agent_end` fire. The "swap the buffer" approach handles this.
