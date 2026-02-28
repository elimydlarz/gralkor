import type { GraphitiClient, Fact, EntityNode } from "./client.js";
import type { GralkorConfig } from "./config.js";

export interface ToolOverrides {
  name?: string;
  description?: string;
}

export function formatFacts(facts: Fact[]): string {
  if (facts.length === 0) return "No graph facts found.";
  const lines = facts
    .map((f) => {
      const validity =
        f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
      return `- ${f.fact}${validity}`;
    })
    .join("\n");
  return `Facts (knowledge graph):\n${lines}`;
}

export function formatNodes(nodes: EntityNode[]): string {
  if (nodes.length === 0) return "";
  return (
    "\n\nEntities (knowledge graph):\n" +
    nodes.map((n) => `- **${n.name}**: ${n.summary}`).join("\n")
  );
}

export function createMemoryRecallTool(
  client: GraphitiClient,
  config: GralkorConfig,
  overrides?: ToolOverrides,
  getGroupId?: () => string,
) {
  return {
    name: overrides?.name ?? "graph_search",
    description:
      overrides?.description ??
      "Search the knowledge graph for relevant facts and entities. Recent conversation context is automatically injected — use this for deeper queries, older context, or specific entity lookups.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "The search query to find relevant memories",
        },
        limit: {
          type: "number" as const,
          description: "Maximum number of results to return",
          default: 10,
        },
      },
      required: ["query"] as const,
    },
    async execute(
      _toolCallId: string,
      args: { query: string; limit?: number },
    ): Promise<string> {
      console.log("[gralkor] [graph_search] execute — toolCallId:", _toolCallId, "args:", JSON.stringify(args));
      const groupId = getGroupId?.() ?? "default";
      const limit = args.limit ?? 10;
      console.log("[gralkor] [graph_search] searching — query:", JSON.stringify(args.query), "groupId:", groupId, "limit:", limit);

      const [facts, nodes] = await Promise.all([
        client.searchFacts(args.query, [groupId], limit),
        client.searchNodes(args.query, [groupId], limit),
      ]);

      console.log("[gralkor] [graph_search] results — groupId:", groupId, "—", facts.length, "facts,", nodes.length, "nodes");

      return formatFacts(facts) + formatNodes(nodes);
    },
  };
}

export function createMemoryStoreTool(
  client: GraphitiClient,
  config: GralkorConfig,
  overrides?: ToolOverrides,
  getGroupId?: () => string,
) {
  return {
    name: overrides?.name ?? "graph_add",
    description:
      overrides?.description ??
      "Store a thought, insight, reflection, or decision in the knowledge graph. Conversations are already captured automatically — use this for higher-level reasoning, conclusions, and connections you want to preserve, not for recording what was said.",
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
      const toolName = overrides?.name ?? "graph_add";
      console.log(`[gralkor] [${toolName}] execute — toolCallId:`, _toolCallId, "args:", JSON.stringify(args));
      const groupId = getGroupId?.() ?? "default";
      console.log(`[gralkor] [${toolName}] storing — groupId:`, groupId, "contentLength:", args.content.length);

      await client.addEpisode({
        name: `memory-store-${Date.now()}`,
        episode_body: args.content,
        source_description: args.source ?? "manual memory_store",
        group_id: groupId,
      });

      console.log(`[gralkor] [${toolName}] stored successfully`);
      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}
