import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

/**
 * Hook context provided by the OpenClaw gateway.
 * Handlers receive a single ctx object — NOT (event, ctx).
 */
interface HookContext {
  agentId?: string;
  userMessage?: string;
  agentResponse?: string;
}

export function extractKeyTerms(text: string): string {
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
    console.log("[gralkor] [auto-recall] hook fired — ctx:", {
      agentId: ctx.agentId,
      userMessage: ctx.userMessage ? `${ctx.userMessage.length} chars` : undefined,
      agentResponse: ctx.agentResponse ? `${ctx.agentResponse.length} chars` : undefined,
      ctxKeys: Object.keys(ctx),
    });

    const agentId = ctx.agentId;
    if (setGroupId && agentId) {
      setGroupId(agentId);
    }

    if (!config.autoRecall.enabled) {
      console.log("[gralkor] [auto-recall] disabled, skipping");
      return;
    }

    const userMessage = ctx.userMessage ?? "";
    if (!userMessage) {
      console.log("[gralkor] [auto-recall] no userMessage, skipping");
      return;
    }

    const query = extractKeyTerms(userMessage);
    if (!query) {
      console.log("[gralkor] [auto-recall] no key terms extracted, skipping");
      return;
    }

    const groupId = resolveGroupId({ agentId });
    console.log("[gralkor] [auto-recall] searching — query:", JSON.stringify(query), "groupId:", groupId);

    try {
      const facts = await client.searchFacts(
        query,
        [groupId],
        config.autoRecall.maxResults,
      );

      console.log("[gralkor] [auto-recall] search returned", facts.length, "facts — groupId:", groupId, "—", facts.map((f) => f.fact));

      if (facts.length === 0) return;

      const formatted = facts
        .map((f) => `- ${f.fact}`)
        .join("\n");

      return {
        prependContext: `<gralkor-memory source="auto-recall" trust="untrusted">\nRelevant facts from knowledge graph:\n${formatted}\n</gralkor-memory>`,
      };
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
    console.log("[gralkor] [auto-capture] hook fired — ctx:", {
      agentId: ctx.agentId,
      userMessage: ctx.userMessage ? `${ctx.userMessage.length} chars` : undefined,
      agentResponse: ctx.agentResponse ? `${ctx.agentResponse.length} chars` : undefined,
      ctxKeys: Object.keys(ctx),
    });

    if (!config.autoCapture.enabled) {
      console.log("[gralkor] [auto-capture] disabled, skipping");
      return;
    }

    const userMsg = ctx.userMessage ?? "";
    const agentMsg = ctx.agentResponse ?? "";

    // Skip trivially short exchanges or system commands
    if (userMsg.length < 10 && agentMsg.length < 10) {
      console.log("[gralkor] [auto-capture] messages too short, skipping — user:", userMsg.length, "agent:", agentMsg.length);
      return;
    }
    if (userMsg.startsWith("/")) {
      console.log("[gralkor] [auto-capture] slash command, skipping");
      return;
    }

    const agentId = ctx.agentId;
    const groupId = resolveGroupId({ agentId });
    const body = `User: ${userMsg}\nAssistant: ${agentMsg}`;

    console.log("[gralkor] [auto-capture] storing episode — groupId:", groupId, "bodyLength:", body.length);

    try {
      await client.addEpisode({
        name: `conversation-${Date.now()}`,
        episode_body: body,
        source_description: "auto-capture",
        group_id: groupId,
      });
      console.log("[gralkor] [auto-capture] episode stored successfully");
    } catch (err) {
      console.warn("[gralkor] [auto-capture] store failed:", err instanceof Error ? err.message : err);
    }
  };
}
