import type { GraphitiClient, Fact, EntityNode, SearchMode } from "./client.js";
import type { GralkorConfig, ReadyGate } from "./config.js";

export const INTERPRETATION_INSTRUCTION =
  "Review memory search results for relevant facts. " +
  "For each relevant fact, explain how it can help you deal with the task at hand.";

export function formatTimestamp(ts: string): string {
  let s = ts.replace(/\.\d+/, "");
  s = s.replace(/Z$/, "+0");
  s = s.replace(/([+-])(\d{2}):(\d{2})$/, (_, sign, h, m) => {
    const hours = String(parseInt(h, 10));
    return m === "00" ? `${sign}${hours}` : `${sign}${hours}:${m}`;
  });
  return s;
}

export function formatFact(f: Fact): string {
  const fmt = (ts: string) => formatTimestamp(ts);
  const createdAt = f.created_at ? ` (created ${fmt(f.created_at)})` : "";
  const validAt = f.valid_at ? ` (valid from ${fmt(f.valid_at)})` : "";
  const invalidAt = f.invalid_at ? ` (invalid since ${fmt(f.invalid_at)})` : "";
  const expiredAt = f.expired_at ? ` (expired ${fmt(f.expired_at)})` : "";
  return `- ${f.fact}${createdAt}${validAt}${invalidAt}${expiredAt}`;
}

export function formatFacts(facts: Fact[]): string {
  if (facts.length === 0) return "No graph facts found.";
  const lines = facts.map(formatFact).join("\n");
  return `Facts:\n${lines}`;
}

export function formatNode(n: EntityNode): string {
  return `- ${n.name}: ${n.summary ?? "(no summary)"}`;
}

export interface ToolOpts {
  getGroupId?: () => string;
  serverReady?: ReadyGate;
}

export function createMemoryStoreTool(
  client: GraphitiClient,
  config: GralkorConfig,
  opts: ToolOpts = {},
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
        throw new Error(`[gralkor] memory_add failed: server is not ready`);
      }

      const groupId = getGroupId?.() ?? "default";
      console.log(`[gralkor] memory_add storing — groupId:${groupId} bodySize:${args.content.length}`);

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

      console.log(`[gralkor] memory_add stored — groupId:${groupId}`);
      return "Stored successfully. The knowledge graph will extract entities and relationships from this content.";
    },
  };
}

export function createMemorySearchTool(
  client: GraphitiClient,
  config: GralkorConfig,
  opts: ToolOpts = {},
) {
  const { getGroupId, serverReady } = opts;
  return {
    name: "memory_search",
    description: "Search memory for relevant context. Use specific, focused queries.",
    parameters: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const },
      },
      required: ["query"] as const,
    },
    async execute(
      _toolCallId: string,
      args: { query: string },
    ): Promise<string> {
      if (serverReady && !serverReady.isReady()) {
        throw new Error("[gralkor] memory_search failed: server is not ready");
      }

      const groupId = getGroupId?.() ?? "default";
      const maxFacts = config.search.maxResults;
      const maxEntities = config.search.maxEntityResults;
      const results = await client.search(args.query, [groupId], maxFacts, "slow");
      const facts = results.facts;
      const nodes = results.nodes.slice(0, maxEntities);
      const factCount = facts.length;
      const nodeCount = nodes.length;
      console.log(`[gralkor] memory_search result — graph: ${factCount} facts ${nodeCount} nodes — groupId:${groupId}`);

      if (factCount === 0 && nodeCount === 0) return "No facts found.";

      const nodeSection = nodeCount > 0
        ? "\n\nEntities:\n" + nodes.map(formatNode).join("\n")
        : "";
      const output = formatFacts(facts) + nodeSection + "\n\n" + INTERPRETATION_INSTRUCTION;

      if (config.test) {
        console.log(`[gralkor] [test] memory_search query: ${args.query}`);
        console.log(`[gralkor] [test] memory_search result:\n${output}`);
      }

      return output;
    },
  };
}

export function createBuildIndicesTool(
  client: GraphitiClient,
  opts: ToolOpts = {},
) {
  const { serverReady } = opts;
  return {
    name: "memory_build_indices",
    description:
      "Rebuild the knowledge graph's search indices and constraints. " +
      "Use after bulk operations or if search results seem incomplete.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
    async execute(): Promise<string> {
      if (serverReady && !serverReady.isReady()) {
        throw new Error(`[gralkor] memory_build_indices failed: server is not ready`);
      }
      console.log(`[gralkor] memory_build_indices starting`);
      const result = await client.buildIndices();
      console.log(`[gralkor] memory_build_indices done — status:${result.status}`);
      return `Indices rebuilt successfully.`;
    },
  };
}

export function createBuildCommunitiesTool(
  client: GraphitiClient,
  opts: ToolOpts = {},
) {
  const { getGroupId, serverReady } = opts;
  return {
    name: "memory_build_communities",
    description:
      "Detect and build entity communities (clusters) in the knowledge graph. " +
      "Communities group related entities together and can improve search quality. " +
      "Run periodically or after significant new information has been ingested.",
    parameters: {
      type: "object" as const,
      properties: {},
    },
    async execute(): Promise<string> {
      if (serverReady && !serverReady.isReady()) {
        throw new Error(`[gralkor] memory_build_communities failed: server is not ready`);
      }
      const groupId = getGroupId?.() ?? "default";
      console.log(`[gralkor] memory_build_communities starting — groupId:${groupId}`);
      const result = await client.buildCommunities(groupId);
      console.log(`[gralkor] memory_build_communities done — communities:${result.communities} edges:${result.edges}`);
      return `Communities built: ${result.communities} communities, ${result.edges} edges.`;
    },
  };
}
