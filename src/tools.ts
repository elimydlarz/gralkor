import type { GraphitiClient, Fact, EntityNode, Episode, Community, SearchResults } from "./client.js";
import type { GralkorConfig } from "./config.js";

export interface ToolOverrides {
  name?: string;
  description?: string;
}

export function formatFacts(facts: Fact[]): string {
  if (facts.length === 0) return "No graph facts found.";
  const lines = facts
    .map((f) => {
      const validAt = f.valid_at ? ` (valid from ${f.valid_at})` : "";
      const invalidAt = f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
      return `- ${f.fact}${validAt}${invalidAt}`;
    })
    .join("\n");
  return `Facts (knowledge graph):\n${lines}`;
}

export function formatNodes(nodes: EntityNode[]): string {
  if (nodes.length === 0) return "";
  const lines = nodes.map((n) => `- ${n.name}: ${n.summary}`).join("\n");
  return `Entities:\n${lines}`;
}

export function formatEpisodes(episodes: Episode[]): string {
  if (episodes.length === 0) return "";
  const maxLen = 200;
  const lines = episodes.map((ep) => {
    const content = ep.content.length > maxLen
      ? ep.content.slice(0, maxLen) + "…"
      : ep.content;
    return `- ${content}`;
  }).join("\n");
  return `Episodes:\n${lines}`;
}

export function formatCommunities(communities: Community[]): string {
  if (communities.length === 0) return "";
  const lines = communities.map((c) => `- ${c.name}: ${c.summary}`).join("\n");
  return `Topics:\n${lines}`;
}

export function formatSearchResults(results: SearchResults): string {
  const sections: string[] = [];

  if (results.facts.length > 0) sections.push(formatFacts(results.facts));
  if (results.nodes.length > 0) sections.push(formatNodes(results.nodes));
  if (results.episodes.length > 0) sections.push(formatEpisodes(results.episodes));
  if (results.communities.length > 0) sections.push(formatCommunities(results.communities));

  return sections.length > 0 ? sections.join("\n\n") : "No graph results found.";
}

export function createMemoryStoreTool(
  client: GraphitiClient,
  config: GralkorConfig,
  overrides?: ToolOverrides,
  getGroupId?: () => string,
) {
  const toolName = overrides?.name ?? "memory_add";
  return {
    name: toolName,
    description:
      overrides?.description ??
      "Store a thought, insight, reflection, or decision in the knowledge graph. Conversations are already captured automatically — use this for higher-level reasoning, conclusions, and connections you want to preserve, not for recording what was said. Also store detailed descriptions of any images or videos you consume, as media content is not captured by automatic memory.",
    parameters: {
      type: "object" as const,
      properties: {
        content: {
          type: "string" as const,
          description: "The information to store in memory",
        },
        source: {
          type: "string" as const,
          description: "Optional description of where this information came from",
        },
      },
      required: ["content"] as const,
    },
    async execute(
      _toolCallId: string,
      args: { content: string; source?: string },
    ): Promise<string> {
      console.log(`[gralkor] [${toolName}] execute — toolCallId:`, _toolCallId, "args:", JSON.stringify(args));
      const groupId = getGroupId?.() ?? "default";
      console.log(`[gralkor] [${toolName}] storing — groupId:`, groupId, "contentLength:", args.content.length);

      await client.addEpisode({
        name: `memory-store-${Date.now()}`,
        episode_body: args.content,
        source_description: args.source ?? "manual memory_store",
        group_id: groupId,
      });

      console.log(`[gralkor] [${toolName}] stored successfully — groupId:`, groupId);
      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}
