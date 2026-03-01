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
import type { ToolPluginApi } from "./types.js";

function registerFullPlugin(
  api: ToolPluginApi,
  client: GraphitiClient,
  config: GralkorConfig,
) {
  // Shared group ID: hooks capture agentId, tools read it
  let currentGroupId = "default";
  const getGroupId = () => currentGroupId;
  const setGroupId = (id: string) => { currentGroupId = id; };

  // Tools
  const searchTool = createMemoryRecallTool(client, config, undefined, getGroupId);
  const addTool = createMemoryStoreTool(client, config, undefined, getGroupId);

  api.registerTool(searchTool);
  api.registerTool(addTool);

  // Hooks
  registerHooks(api, client, config, setGroupId);

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

export function register(api: ToolPluginApi, rawConfig?: Partial<GralkorConfig>) {
  const config = resolveConfig(rawConfig);
  const client = new GraphitiClient({ baseUrl: GRAPHITI_URL });
  registerFullPlugin(api, client, config);
}

export default { id, name, description, kind, configSchema, register };
