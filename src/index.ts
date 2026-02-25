declare const process: { env: Record<string, string | undefined> };

import { GraphitiClient } from "./client.js";
import { resolveConfig, SHARED_GROUP_ID, type GralkorConfig } from "./config.js";
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(tool: {
    name: string;
    description: string;
    parameters: unknown;
    execute: (args: any, ctx: any) => Promise<any>;
  }): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHook(hook: {
    name: string;
    execute: (ctx: any) => Promise<any>;
  }): void;
  registerService(service: {
    name: string;
    interval: number;
    execute: () => Promise<void>;
  }): void;
  registerCli(
    registrar: (ctx: {
      program: any;
      config: any;
      workspaceDir?: string;
      logger: any;
    }) => void | Promise<void>,
    opts?: { commands?: string[] },
  ): void;
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
  api.registerCli(
    ({ program }) => {
      const gralkor = program
        .command("gralkor")
        .description("Manage the Gralkor memory backend");

      gralkor
        .command("status")
        .description("Check Graphiti and FalkorDB connection status")
        .action(async () => {
          try {
            const result = await client.health();
            console.log(
              `Graphiti is ${result.status ?? "reachable"} at ${config.graphitiUrl}`,
            );
          } catch (err) {
            console.log(
              `Graphiti is unreachable at ${config.graphitiUrl}: ${err instanceof Error ? err.message : err}`,
            );
          }
        });

      gralkor
        .command("search <query...>")
        .description("Search the shared knowledge graph")
        .action(async (query: string[]) => {
          const q = query.join(" ");
          try {
            const facts = await client.searchFacts(q, [SHARED_GROUP_ID], 10);
            if (facts.length === 0) {
              console.log("No results found.");
              return;
            }
            console.log(facts.map((f) => `- ${f.fact}`).join("\n"));
          } catch (err) {
            console.log(
              `Search failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        });

      gralkor
        .command("clear [group_id]")
        .description("Clear the knowledge graph for a group")
        .action(async (groupId?: string) => {
          const id = groupId ?? SHARED_GROUP_ID;
          try {
            await client.clearGraph(id);
            console.log(`Cleared graph for group "${id}".`);
          } catch (err) {
            console.log(
              `Clear failed: ${err instanceof Error ? err.message : err}`,
            );
          }
        });
    },
    { commands: ["gralkor"] },
  );
}

export const id = "memory-gralkor";
export const name = "Gralkor Memory";
export const description =
  "Persistent, temporally-aware memory via Graphiti knowledge graphs and FalkorDB";
export const kind = "memory" as const;

export const configSchema = {
  type: "object" as const,
  properties: {
    graphitiUrl: { type: "string" as const, default: "http://localhost:8000" },
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
};

export function register(api: PluginApi, rawConfig?: Partial<GralkorConfig>) {
  const config = resolveConfig(rawConfig);

  if (!rawConfig?.graphitiUrl && !process.env.GRAPHITI_URL) {
    // No explicit URL configured — only register CLI so the user can set things up
    const client = new GraphitiClient({ baseUrl: config.graphitiUrl });
    registerCli(api, client, config);
    return;
  }

  const client = new GraphitiClient({ baseUrl: config.graphitiUrl });
  registerFullPlugin(api, client, config);
}

export default { id, name, description, kind, configSchema, register };
