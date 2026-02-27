import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HookArg = Record<string, any>;

function extractKeyTerms(text: string): string {
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

/**
 * Extract the user message from hook arguments.
 *
 * The gateway may call hooks with a single ctx object or (event, ctx).
 * We search all provided objects for the message in multiple possible locations:
 *   - ctx.userMessage  (OpenClaw hook ctx convention)
 *   - event.prompt     (alternative event payload)
 *   - event.messages   (array of {role, content} objects)
 */
function extractUserMessage(...args: HookArg[]): string {
  for (const obj of args) {
    if (!obj || typeof obj !== "object") continue;
    if (typeof obj.userMessage === "string") return obj.userMessage;
    if (typeof obj.prompt === "string") return obj.prompt;
    if (Array.isArray(obj.messages)) {
      for (let i = obj.messages.length - 1; i >= 0; i--) {
        const m = obj.messages[i];
        if (m?.role === "user" && typeof m.content === "string") return m.content;
      }
    }
  }
  return "";
}

/**
 * Extract the assistant message from hook arguments.
 * Same multi-field strategy as extractUserMessage.
 */
function extractAssistantMessage(...args: HookArg[]): string {
  for (const obj of args) {
    if (!obj || typeof obj !== "object") continue;
    if (typeof obj.agentResponse === "string") return obj.agentResponse;
    if (typeof obj.response === "string") return obj.response;
    if (Array.isArray(obj.messages)) {
      for (let i = obj.messages.length - 1; i >= 0; i--) {
        const m = obj.messages[i];
        if (m?.role === "assistant" && typeof m.content === "string") return m.content;
      }
    }
  }
  return "";
}

/**
 * Extract agentId from hook arguments (may be in any of the provided objects).
 */
function extractAgentId(...args: HookArg[]): string | undefined {
  for (const obj of args) {
    if (!obj || typeof obj !== "object") continue;
    if (typeof obj.agentId === "string") return obj.agentId;
  }
  return undefined;
}

export function createBeforeAgentStartHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  setGroupId?: (id: string) => void,
) {
  // Gateway may call with (ctx) or (event, ctx) — accept either
  return async (...args: HookArg[]): Promise<{ prependContext?: string } | void> => {
    const agentId = extractAgentId(...args);
    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log("[gralkor] auto-recall: disabled by config");
      return;
    }

    const userMessage = extractUserMessage(...args);
    if (!userMessage) {
      console.log("[gralkor] auto-recall: no user message found in hook args (keys: %s)",
        args.map(a => a ? Object.keys(a).join(",") : "undefined").join(" | "));
      return;
    }

    const query = extractKeyTerms(userMessage);
    if (!query) {
      console.log("[gralkor] auto-recall: user message yielded empty query after stop-word removal");
      return;
    }

    const groupId = resolveGroupId({ agentId });
    console.log("[gralkor] auto-recall: searching query=%j group=%s", query, groupId);

    try {
      const facts = await client.searchFacts(
        query,
        [groupId],
        config.autoRecall.maxResults,
      );

      if (facts.length === 0) {
        console.log("[gralkor] auto-recall: no facts matched");
        return;
      }

      console.log("[gralkor] auto-recall: injecting %d facts", facts.length);
      const formatted = facts
        .map((f) => `- ${f.fact}`)
        .join("\n");

      return {
        prependContext: `<gralkor-memory source="auto-recall" trust="untrusted">\nRelevant facts from knowledge graph:\n${formatted}\n</gralkor-memory>`,
      };
    } catch (err) {
      console.warn("[gralkor] auto-recall: search failed:", err instanceof Error ? err.message : err);
      return;
    }
  };
}

export function createAgentEndHandler(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  // Gateway may call with (ctx) or (event, ctx) — accept either
  return async (...args: HookArg[]): Promise<void> => {
    if (!config.autoCapture.enabled) {
      console.log("[gralkor] auto-capture: disabled by config");
      return;
    }

    const userMsg = extractUserMessage(...args);
    const agentMsg = extractAssistantMessage(...args);

    // Skip trivially short exchanges or system commands
    if (userMsg.length < 10 && agentMsg.length < 10) {
      console.log("[gralkor] auto-capture: skipped (messages too short: user=%d, agent=%d)",
        userMsg.length, agentMsg.length);
      return;
    }
    if (userMsg.startsWith("/")) {
      console.log("[gralkor] auto-capture: skipped (/ command)");
      return;
    }

    const agentId = extractAgentId(...args);
    const groupId = resolveGroupId({ agentId });
    const body = `User: ${userMsg}\nAssistant: ${agentMsg}`;

    console.log("[gralkor] auto-capture: storing episode (group=%s, bodyLen=%d)", groupId, body.length);

    try {
      await client.addEpisode({
        name: `conversation-${Date.now()}`,
        episode_body: body,
        source_description: "auto-capture",
        group_id: groupId,
      });
      console.log("[gralkor] auto-capture: episode stored successfully");
    } catch (err) {
      console.warn("[gralkor] auto-capture: store failed:", err instanceof Error ? err.message : err);
    }
  };
}
