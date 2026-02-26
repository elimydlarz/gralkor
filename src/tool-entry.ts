import { GraphitiClient } from "./client.js";
import { resolveConfig, GRAPHITI_URL, type GralkorConfig } from "./config.js";
import {
  createMemoryRecallTool,
  createMemoryStoreTool,
} from "./tools.js";
import {
  registerHooks,
  registerHealthService,
  registerCli,
} from "./register.js";

interface PluginApi {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(
    tool: { name: string; description: string; parameters: unknown; execute: (...args: any[]) => Promise<any> },
    opts?: { optional?: boolean },
  ): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHook(
    event: string,
    handler: (ctx: any) => Promise<any>,
    metadata: { name: string; description?: string },
  ): void;
  registerService(service: {
    id: string;
    start: () => void;
    stop: () => void;
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
  // Tools — graph_* names to coexist with native memory_* tools
  const searchTool = createMemoryRecallTool(client, config, {
    name: "graph_search",
    description:
      "Search the Graphiti knowledge graph for relational facts, entity connections, and cross-conversation reasoning. Recent conversation context is automatically injected — use this for deeper queries, older context, or specific entity lookups.",
  });
  const addTool = createMemoryStoreTool(client, config, {
    name: "graph_add",
    description:
      "Store a thought, insight, reflection, or decision in the Graphiti knowledge graph. Conversations are already captured automatically — use this for higher-level reasoning, conclusions, and connections you want to preserve, not for recording what was said.",
  });

  api.registerTool(searchTool);
  api.registerTool(addTool);

  // Hooks
  registerHooks(api, client, config);

  // Health monitor service
  registerHealthService(api, client);

  // CLI
  registerCli(api, client, config);
}

export const id = "gralkor";
export const name = "Gralkor Graph Tools";
export const description =
  "Knowledge graph tools powered by Graphiti — complements native memory";
export const kind = "tool" as const;

export const configSchema = {
  type: "object" as const,
  properties: {
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
  const client = new GraphitiClient({ baseUrl: GRAPHITI_URL });
  registerFullPlugin(api, client, config);
}

export default { id, name, description, kind, configSchema, register };
