import { GraphitiClient } from "./client.js";
import { resolveConfig, type GralkorConfig } from "./config.js";
import {
  createMemoryRecallTool,
  createMemoryStoreTool,
  createMemoryForgetTool,
} from "./tools.js";
import {
  createBeforeAgentStartHook,
  createAgentEndHook,
} from "./hooks.js";

interface PluginApi {
  registerTool(tool: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (args: unknown, ctx: unknown) => Promise<unknown>;
  }): void;
  registerHook(hook: {
    name: string;
    execute: (ctx: unknown) => Promise<unknown>;
  }): void;
  registerService(service: {
    name: string;
    interval: number;
    execute: () => Promise<void>;
  }): void;
  registerCli(cli: {
    name: string;
    description: string;
    commands: Array<{
      name: string;
      description: string;
      execute: (args: string[]) => Promise<string>;
    }>;
  }): void;
}

function registerFullPlugin(
  api: PluginApi,
  client: GraphitiClient,
  config: GralkorConfig,
) {
  // Tools
  const recallTool = createMemoryRecallTool(client, config);
  const storeTool = createMemoryStoreTool(client, config);
  const forgetTool = createMemoryForgetTool(client, config);

  api.registerTool(recallTool);
  api.registerTool(storeTool);
  api.registerTool(forgetTool);

  // Hooks
  api.registerHook(createBeforeAgentStartHook(client, config));
  api.registerHook(createAgentEndHook(client, config));

  // Health monitor service
  api.registerService({
    name: "gralkor-health",
    interval: 60_000,
    async execute() {
      try {
        await client.health();
      } catch (err) {
        console.warn(
          "[gralkor] Graphiti health check failed:",
          err instanceof Error ? err.message : err,
        );
      }
    },
  });

  // CLI
  registerCli(api, client, config);
}

function registerCli(
  api: PluginApi,
  client: GraphitiClient,
  config: GralkorConfig,
) {
  api.registerCli({
    name: "gralkor",
    description: "Manage the Gralkor memory backend",
    commands: [
      {
        name: "status",
        description: "Check Graphiti and FalkorDB connection status",
        async execute() {
          try {
            const result = await client.health();
            return `Graphiti is ${result.status ?? "reachable"} at ${config.graphitiUrl}`;
          } catch (err) {
            return `Graphiti is unreachable at ${config.graphitiUrl}: ${err instanceof Error ? err.message : err}`;
          }
        },
      },
      {
        name: "search",
        description: "Search the knowledge graph (usage: gralkor search <query>)",
        async execute(args: string[]) {
          const query = args.join(" ");
          if (!query) return "Usage: gralkor search <query>";

          try {
            const facts = await client.searchFacts(query, "gralkor", 10);
            if (facts.length === 0) return "No results found.";
            return facts.map((f) => `- ${f.fact}`).join("\n");
          } catch (err) {
            return `Search failed: ${err instanceof Error ? err.message : err}`;
          }
        },
      },
      {
        name: "clear",
        description: "Clear all episodes for a group (usage: gralkor clear [group_id])",
        async execute(args: string[]) {
          const groupId = args[0] ?? "gralkor";

          try {
            const episodes = await client.getEpisodes(groupId, 100);
            if (episodes.length === 0)
              return `No episodes found for group "${groupId}".`;

            let deleted = 0;
            for (const ep of episodes) {
              await client.deleteEpisode(ep.uuid);
              deleted++;
            }
            return `Deleted ${deleted} episode(s) from group "${groupId}".`;
          } catch (err) {
            return `Clear failed: ${err instanceof Error ? err.message : err}`;
          }
        },
      },
    ],
  });
}

export default {
  id: "memory-gralkor",
  name: "Gralkor Memory",
  description:
    "Persistent, temporally-aware memory via Graphiti knowledge graphs and FalkorDB",
  kind: "memory" as const,

  configSchema: {
    type: "object" as const,
    properties: {
      graphitiUrl: { type: "string" as const, default: "http://localhost:8000" },
      groupIdStrategy: {
        type: "string" as const,
        enum: ["per-user", "per-conversation", "global"],
        default: "per-user",
      },
      autoCapture: {
        type: "object" as const,
        properties: {
          enabled: { type: "boolean" as const, default: true },
        },
      },
      autoRecall: {
        type: "object" as const,
        properties: {
          enabled: { type: "boolean" as const, default: true },
          maxResults: { type: "number" as const, default: 5 },
        },
      },
    },
  },

  register(api: PluginApi, rawConfig?: Partial<GralkorConfig>) {
    const config = resolveConfig(rawConfig);

    if (!rawConfig?.graphitiUrl && !process.env.GRAPHITI_URL) {
      // No explicit URL configured — only register CLI so the user can set things up
      const client = new GraphitiClient({ baseUrl: config.graphitiUrl });
      registerCli(api, client, config);
      return;
    }

    const client = new GraphitiClient({ baseUrl: config.graphitiUrl });
    registerFullPlugin(api, client, config);
  },
};
