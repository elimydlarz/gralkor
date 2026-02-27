import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventPayload = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventContext = Record<string, any>;

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
 * Extract the last user message text from an event payload.
 * The gateway may provide it as `event.prompt` (string) or inside
 * `event.messages` (array of {role, content} objects).
 */
function extractUserMessage(event: EventPayload): string {
  if (typeof event.prompt === "string") return event.prompt;
  if (Array.isArray(event.messages)) {
    for (let i = event.messages.length - 1; i >= 0; i--) {
      const m = event.messages[i];
      if (m?.role === "user" && typeof m.content === "string") return m.content;
    }
  }
  return "";
}

/**
 * Extract the last assistant message text from an event payload.
 */
function extractAssistantMessage(event: EventPayload): string {
  if (typeof event.response === "string") return event.response;
  if (Array.isArray(event.messages)) {
    for (let i = event.messages.length - 1; i >= 0; i--) {
      const m = event.messages[i];
      if (m?.role === "assistant" && typeof m.content === "string") return m.content;
    }
  }
  return "";
}

export function createBeforeAgentStartHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  setGroupId?: (id: string) => void,
) {
  return async (event: EventPayload, ctx: EventContext): Promise<{ prependContext?: string } | void> => {
    const agentId = ctx.agentId as string | undefined;
    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) return;

    const userMessage = extractUserMessage(event);
    if (!userMessage) return;

    const query = extractKeyTerms(userMessage);
    if (!query) return;

    const groupId = resolveGroupId({ agentId });

    try {
      const facts = await client.searchFacts(
        query,
        [groupId],
        config.autoRecall.maxResults,
      );

      if (facts.length === 0) return;

      const formatted = facts
        .map((f) => `- ${f.fact}`)
        .join("\n");

      return {
        prependContext: `<gralkor-memory source="auto-recall" trust="untrusted">\nRelevant facts from knowledge graph:\n${formatted}\n</gralkor-memory>`,
      };
    } catch {
      // Graphiti unavailable — degrade silently
      return;
    }
  };
}

export function createAgentEndHandler(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  return async (event: EventPayload, ctx: EventContext): Promise<void> => {
    if (!config.autoCapture.enabled) return;

    const userMsg = extractUserMessage(event);
    const agentMsg = extractAssistantMessage(event);

    // Skip trivially short exchanges or system commands
    if (userMsg.length < 10 && agentMsg.length < 10) return;
    if (userMsg.startsWith("/")) return;

    const agentId = ctx.agentId as string | undefined;
    const groupId = resolveGroupId({ agentId });
    const body = `User: ${userMsg}\nAssistant: ${agentMsg}`;

    try {
      await client.addEpisode({
        name: `conversation-${Date.now()}`,
        episode_body: body,
        source_description: "auto-capture",
        group_id: groupId,
      });
    } catch {
      // Graphiti unavailable — degrade silently
    }
  };
}
