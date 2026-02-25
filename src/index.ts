import { GraphitiClient } from "./client.js";
import { resolveConfig, probeGraphitiUrl, type GralkorConfig } from "./config.js";
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
  runtime: {
    tools: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMemorySearchTool(opts: { config?: any; agentSessionKey?: string }): any | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      createMemoryGetTool(opts: { config?: any; agentSessionKey?: string }): any | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      registerMemoryCli(program: any): void;
    };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerTool(
    toolOrFactory:
      | { name: string; description: string; parameters: unknown; execute: (args: any, ctx: any) => Promise<any> }
      | ((ctx: { config?: any; agentId?: string; sessionKey?: string }) => any),
    opts?: { names?: string[] },
  ): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerHook(event: string, handler: (ctx: any) => Promise<any>): void;
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
  // Tools — graph_memory_* prefix distinguishes these from native file-based memory_search/get
  const recallTool = createMemoryRecallTool(client, config, { name: "graph_memory_recall" });
  const storeTool = createMemoryStoreTool(client, config, { name: "graph_memory_store" });

  api.registerTool(recallTool);
  api.registerTool(storeTool);

  // Native memory_search + memory_get (re-register what memory-core would provide)
  api.registerTool(
    (ctx) => {
      const memorySearchTool = api.runtime.tools.createMemorySearchTool({
        config: ctx.config,
        agentSessionKey: ctx.sessionKey,
      });
      const memoryGetTool = api.runtime.tools.createMemoryGetTool({
        config: ctx.config,
        agentSessionKey: ctx.sessionKey,
      });
      if (!memorySearchTool || !memoryGetTool) {
        return null;
      }
      return [memorySearchTool, memoryGetTool];
    },
    { names: ["memory_search", "memory_get"] },
  );

  // Hooks
  registerHooks(api, client, config);

  // Health monitor service
  registerHealthService(api, client);

  // CLI
  registerCli(api, client, config);

  // Native memory CLI (re-register what memory-core would provide)
  api.registerCli(
    ({ program }) => {
      api.runtime.tools.registerMemoryCli(program);
    },
    { commands: ["memory"] },
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

export async function register(api: PluginApi, rawConfig?: Partial<GralkorConfig>) {
  const config = resolveConfig(rawConfig);
  const explicitUrl = rawConfig?.graphitiUrl;

  if (explicitUrl) {
    const client = new GraphitiClient({ baseUrl: config.graphitiUrl });
    registerFullPlugin(api, client, config);
    return;
  }

  // No explicit URL — probe for a running Graphiti instance
  const discoveredUrl = await probeGraphitiUrl();
  if (discoveredUrl) {
    config.graphitiUrl = discoveredUrl;
    const client = new GraphitiClient({ baseUrl: discoveredUrl });
    registerFullPlugin(api, client, config);
    return;
  }

  // Graphiti not found — register CLI only so the user can diagnose
  const client = new GraphitiClient({ baseUrl: config.graphitiUrl });
  registerCli(api, client, config);
}

export default { id, name, description, kind, configSchema, register };
