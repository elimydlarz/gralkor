import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type HookContext = Record<string, any>;

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

export function createBeforeAgentStartHandler(
  client: GraphitiClient,
  config: GralkorConfig,
  setGroupId?: (id: string) => void,
) {
  return async (ctx: HookContext): Promise<{ prependContext?: string } | void> => {
    const agentId = ctx.agentId as string | undefined;
    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log("[gralkor] auto-recall: disabled by config");
      return;
    }

    const userMessage = ctx.userMessage as string | undefined;
    if (!userMessage) {
      console.log("[gralkor] auto-recall: no user message in ctx (keys: %s)", Object.keys(ctx).join(","));
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
  return async (ctx: HookContext): Promise<void> => {
    if (!config.autoCapture.enabled) {
      console.log("[gralkor] auto-capture: disabled by config");
      return;
    }

    const userMsg = (ctx.userMessage as string | undefined) ?? "";
    const agentMsg = (ctx.agentResponse as string | undefined) ?? "";

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

    const agentId = ctx.agentId as string | undefined;
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
