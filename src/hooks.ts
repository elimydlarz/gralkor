import type { GraphitiClient } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

interface HookContext {
  senderId?: string;
  sessionKey?: string;
  channel?: string;
  userMessage?: string;
  agentResponse?: string;
}

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

export function createBeforeAgentStartHook(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  return {
    name: "before_agent_start",
    async execute(ctx: HookContext): Promise<{ context?: string } | void> {
      if (!config.autoRecall.enabled) return;
      if (!ctx.userMessage) return;

      const query = extractKeyTerms(ctx.userMessage);
      if (!query) return;

      const groupId = resolveGroupId(config.groupIdStrategy, ctx);

      try {
        const facts = await client.searchFacts(
          query,
          groupId,
          config.autoRecall.maxResults,
        );

        if (facts.length === 0) return;

        const formatted = facts
          .map((f) => `- ${f.fact}`)
          .join("\n");

        return {
          context: `<gralkor-memory source="auto-recall" trust="untrusted">\nRelevant memories:\n${formatted}\n</gralkor-memory>`,
        };
      } catch {
        // Graphiti unavailable — degrade silently
        return;
      }
    },
  };
}

export function createAgentEndHook(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  return {
    name: "agent_end",
    async execute(ctx: HookContext): Promise<void> {
      if (!config.autoCapture.enabled) return;

      const userMsg = ctx.userMessage ?? "";
      const agentMsg = ctx.agentResponse ?? "";

      // Skip trivially short exchanges or system commands
      if (userMsg.length < 10 && agentMsg.length < 10) return;
      if (userMsg.startsWith("/")) return;

      const groupId = resolveGroupId(config.groupIdStrategy, ctx);
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
    },
  };
}
