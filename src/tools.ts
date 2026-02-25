import type { GraphitiClient, Fact, EntityNode } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupId } from "./config.js";

interface ToolContext {
  agentId?: string;
}

export interface ToolOverrides {
  name?: string;
  description?: string;
}

function formatFacts(facts: Fact[]): string {
  if (facts.length === 0) return "No facts found.";
  return facts
    .map((f) => {
      const validity =
        f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
      return `- ${f.fact}${validity}`;
    })
    .join("\n");
}

function formatNodes(nodes: EntityNode[]): string {
  if (nodes.length === 0) return "";
  return (
    "\n\nEntities:\n" +
    nodes.map((n) => `- **${n.name}**: ${n.summary}`).join("\n")
  );
}

export function createMemoryRecallTool(
  client: GraphitiClient,
  config: GralkorConfig,
  overrides?: ToolOverrides,
) {
  return {
    name: overrides?.name ?? "memory_recall",
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
      args: { query: string; limit?: number },
      ctx: ToolContext,
    ): Promise<string> {
      const groupId = resolveGroupId(ctx);
      const limit = args.limit ?? 10;

      const [facts, nodes] = await Promise.all([
        client.searchFacts(args.query, [groupId], limit),
        client.searchNodes(args.query, [groupId], limit),
      ]);

      return formatFacts(facts) + formatNodes(nodes);
    },
  };
}

export function createMemoryStoreTool(
  client: GraphitiClient,
  config: GralkorConfig,
  overrides?: ToolOverrides,
) {
  return {
    name: overrides?.name ?? "memory_store",
    description:
      overrides?.description ??
      "Store a thought, insight, reflection, or decision in the knowledge graph. Conversations are already captured automatically — use this for higher-level reasoning, conclusions, and connections you want to preserve, not for recording what was said.",
    parameters: {
      type: "object" as const,
      properties: {
        content: {
          type: "string" as const,
          description: "The information to store in the knowledge graph",
        },
        source: {
          type: "string" as const,
          description: "Optional description of where this information came from",
        },
      },
      required: ["content"] as const,
    },
    async execute(
      args: { content: string; source?: string },
      ctx: ToolContext,
    ): Promise<string> {
      const groupId = resolveGroupId(ctx);

      await client.addEpisode({
        name: `memory-store-${Date.now()}`,
        episode_body: args.content,
        source_description: args.source ?? "manual memory_store",
        group_id: groupId,
      });

      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}

