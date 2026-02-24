import type { GraphitiClient, Fact, EntityNode } from "./client.js";
import type { GralkorConfig } from "./config.js";
import { resolveGroupIds, SHARED_GROUP_ID } from "./config.js";

interface ToolContext {
  agentId?: string;
}

function formatFacts(facts: Fact[], agentGroupId: string): string {
  if (facts.length === 0) return "No facts found.";
  return facts
    .map((f) => {
      const source = f.group_id === agentGroupId ? "own" : "family";
      const validity =
        f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
      return `- [${source}] ${f.fact}${validity}`;
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
) {
  return {
    name: "memory_recall",
    description:
      "Search the knowledge graph for relevant facts and entities. Use this to recall information from previous conversations.",
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
      const ids = resolveGroupIds(ctx);
      const limit = args.limit ?? 10;

      const [facts, nodes] = await Promise.all([
        client.searchFacts(args.query, [ids.agent, ids.shared], limit),
        client.searchNodes(args.query, [ids.agent, ids.shared], limit),
      ]);

      return formatFacts(facts, ids.agent) + formatNodes(nodes);
    },
  };
}

export function createMemoryStoreTool(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  return {
    name: "memory_store",
    description:
      "Store information in the knowledge graph. The system will extract entities and relationships automatically.",
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
      const ids = resolveGroupIds(ctx);
      const episode = {
        name: `memory-store-${Date.now()}`,
        episode_body: args.content,
        source_description: args.source ?? "manual memory_store",
      };

      await Promise.all([
        client.addEpisode({ ...episode, group_id: ids.agent }),
        client.addEpisode({ ...episode, group_id: ids.shared }),
      ]);

      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}

export function createMemoryForgetTool(
  client: GraphitiClient,
  config: GralkorConfig,
) {
  return {
    name: "memory_forget",
    description:
      "Remove information from the knowledge graph. Provide a UUID to delete a specific item, or a query to search and delete matching items.",
    parameters: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "Search query to find items to forget",
        },
        uuid: {
          type: "string" as const,
          description: "UUID of a specific episode or edge to delete",
        },
      },
    },
    async execute(
      args: { query?: string; uuid?: string },
      ctx: ToolContext,
    ): Promise<string> {
      if (args.uuid) {
        try {
          await client.deleteEpisode(args.uuid);
          return `Deleted episode ${args.uuid}.`;
        } catch {
          try {
            await client.deleteEdge(args.uuid);
            return `Deleted edge ${args.uuid}.`;
          } catch {
            return `Could not find item with UUID ${args.uuid}.`;
          }
        }
      }

      if (args.query) {
        const ids = resolveGroupIds(ctx);
        const facts = await client.searchFacts(args.query, [ids.agent, ids.shared], 5);
        if (facts.length === 0) {
          return "No matching items found to forget.";
        }
        return (
          "Found matching items. To delete, call memory_forget with the specific UUID:\n" +
          facts
            .map((f) => `- [${f.uuid}] ${f.fact}`)
            .join("\n")
        );
      }

      return "Please provide either a query or a uuid to forget.";
    },
  };
}
