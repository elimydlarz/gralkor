import type { GraphitiClient, Fact } from "./client.js";
import type { GralkorConfig, ReadyGate } from "./config.js";

export function formatFact(f: Fact): string {
  const createdAt = f.created_at ? ` (created ${f.created_at})` : "";
  const validAt = f.valid_at ? ` (valid from ${f.valid_at})` : "";
  const invalidAt = f.invalid_at ? ` (invalid since ${f.invalid_at})` : "";
  const expiredAt = f.expired_at ? ` (expired ${f.expired_at})` : "";
  return `- ${f.fact}${createdAt}${validAt}${invalidAt}${expiredAt}`;
}

export function formatFacts(facts: Fact[]): string {
  if (facts.length === 0) return "No graph facts found.";
  const lines = facts.map(formatFact).join("\n");
  return `Facts (knowledge graph):\n${lines}`;
}

export interface StoreToolOpts {
  getGroupId?: () => string;
  serverReady?: ReadyGate;
}

export function createMemoryStoreTool(
  client: GraphitiClient,
  config: GralkorConfig,
  opts: StoreToolOpts = {},
) {
  const { getGroupId, serverReady } = opts;
  return {
    name: "memory_add",
    description:
      "Store a thought, insight, reflection, or decision in memory. Conversations are already captured automatically — use this for higher-level reasoning, conclusions, and connections you want to preserve, not for recording what was said.",
    parameters: {
      type: "object" as const,
      properties: {
        content: {
          type: "string" as const,
          description: "The information to store in memory",
        },
        source_description: {
          type: "string" as const,
          description: "Optional description of where this information came from",
        },
      },
      required: ["content"] as const,
    },
    async execute(
      _toolCallId: string,
      args: { content: string; source_description?: string },
    ): Promise<string> {
      if (serverReady && !serverReady.isReady()) {
        throw new Error(`[gralkor] ${toolName} failed: server is not ready`);
      }

      const groupId = getGroupId?.() ?? "default";
      console.log(`[gralkor] ${toolName} storing — groupId:${groupId} bodySize:${args.content.length}`);

      if (config.test) {
        console.log(`[gralkor] [test] episode body:\n${args.content}`);
      }

      await client.addEpisode({
        name: `memory-store-${Date.now()}`,
        episode_body: args.content,
        source_description: args.source_description ?? "manual memory_store",
        group_id: groupId,
        source: "text",
      });

      console.log(`[gralkor] ${toolName} stored — groupId:${groupId}`);
      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}
