import type { GraphitiClient, Fact } from "./client.js";
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
      console.log(`[gralkor] [${toolName}] execute — toolCallId:`, _toolCallId, "args:", JSON.stringify(args));
      const groupId = getGroupId?.() ?? "default";
      console.log(`[gralkor] [${toolName}] storing — groupId:`, groupId, "contentLength:", args.content.length);

      await client.addEpisode({
        name: `memory-store-${Date.now()}`,
        episode_body: args.content,
        source_description: args.source_description ?? "manual memory_store",
        group_id: groupId,
        source: "text",
      });

      console.log(`[gralkor] [${toolName}] stored successfully — groupId:`, groupId);
      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}
