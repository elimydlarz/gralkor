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
  // Tools — graph_memory_* prefix distinguishes these from native file-based memory_search/get
  const recallTool = createMemoryRecallTool(client, config, { name: "graph_memory_recall" });
  const storeTool = createMemoryStoreTool(client, config, { name: "graph_memory_store" });

  api.registerTool(recallTool);
  api.registerTool(storeTool);

  // Hooks
  registerHooks(api, client, config);

  // Health monitor service
  registerHealthService(api, client);

  // CLI
  registerCli(api, client, config);
}

export const id = "gralkor";
export const name = "Gralkor Memory";
export const description =
  "Persistent, temporally-aware memory via Graphiti knowledge graphs and FalkorDB";
export const kind = "memory" as const;

export const tools = ["graph_memory_recall", "graph_memory_store"];

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
