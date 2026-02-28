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
  // Plain tool object registration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(
    tool: { name: string; description: string; parameters: unknown; execute: (...args: any[]) => Promise<any> },
    opts?: { optional?: boolean },
  ): void;
  // Factory function registration (used for native memory tools)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(
    factory: (ctx: any) => any | any[] | null,
    opts?: { names?: string[] },
  ): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, handler: (...args: any[]) => any): void;
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
  runtime: {
    tools: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMemorySearchTool(opts: { config: any; agentSessionKey: string }): any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMemoryGetTool(opts: { config: any; agentSessionKey: string }): any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerMemoryCli(program: any): void;
    };
  };
}

function registerFullPlugin(
  api: PluginApi,
  client: GraphitiClient,
  config: GralkorConfig,
) {
  // Shared group ID: hooks capture agentId, tools read it
  let currentGroupId = "default";
  const getGroupId = () => currentGroupId;
  const setGroupId = (id: string) => { currentGroupId = id; };

  // Tools
  const recallTool = createMemoryRecallTool(client, config, undefined, getGroupId);
  const storeTool = createMemoryStoreTool(client, config, undefined, getGroupId);

  api.registerTool(recallTool);
  api.registerTool(storeTool);

  // Hooks
  registerHooks(api, client, config, setGroupId);

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

export const tools = ["graph_search", "graph_add"];

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
