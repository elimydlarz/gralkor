import { GraphitiClient } from "./client.js";
import { resolveConfig, GRAPHITI_URL, type GralkorConfig } from "./config.js";
import {
  createMemoryStoreTool,
  formatFacts,
  formatNodes,
} from "./tools.js";
import {
  registerHooks,
  registerHealthService,
  registerCli,
} from "./register.js";
import type { NativeSearchFn } from "./hooks.js";

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

/**
 * Unwrap native tool execute result to a plain string.
 * Native tools return { content: [{ type: "text", text: "..." }, ...] }
 * rather than a plain string.
 */
function unwrapToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  if (result && typeof result === "object" && "content" in result) {
    const { content } = result as { content: Array<{ type: string; text?: string }> };
    if (Array.isArray(content)) {
      return content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!)
        .join("\n");
    }
  }
  return String(result);
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

  // Shared native search function: factory sets it at agent start, hook reads it
  let nativeSearchFn: NativeSearchFn | null = null;
  const getNativeSearch = () => nativeSearchFn;

  // Native memory tools — delegate to OpenClaw's built-in memory infrastructure
  // The factory wraps memory_search to also search the graph
  api.registerTool(
    (ctx: { config: unknown; sessionKey: string }) => {
      const memorySearchTool = api.runtime.tools.createMemorySearchTool({
        config: ctx.config,
        agentSessionKey: ctx.sessionKey,
      });
      const memoryGetTool = api.runtime.tools.createMemoryGetTool({
        config: ctx.config,
        agentSessionKey: ctx.sessionKey,
      });
      if (!memorySearchTool || !memoryGetTool) return null;

      // Capture native search function for the auto-recall hook
      const originalExecute = memorySearchTool.execute.bind(memorySearchTool);
      nativeSearchFn = async (query: string) => {
        // Native tool execute signature: (toolCallId, params, signal, onUpdate)
        return originalExecute("auto-recall", { query });
      };

      // Wrap memory_search to combine native + graph results
      const wrappedSearchTool = {
        ...memorySearchTool,
        async execute(
          toolCallId: string,
          args: { query: string; limit?: number },
          signal?: AbortSignal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onUpdate?: any,
        ): Promise<string> {
          const groupId = getGroupId();
          const limit = args.limit ?? 10;

          console.log("[gralkor] [memory_search] execute — toolCallId:", toolCallId, "query:", JSON.stringify(args.query), "groupId:", groupId);

          // Search native markdown and graph in parallel
          const [nativeResult, facts, nodes] = await Promise.all([
            originalExecute(toolCallId, args, signal, onUpdate),
            client.searchFacts(args.query, [groupId], limit),
            client.searchNodes(args.query, [groupId], limit),
          ]);

          console.log("[gralkor] [memory_search] results — native:", typeof nativeResult === "string" ? nativeResult.length : 0, "chars,", facts.length, "facts,", nodes.length, "nodes");

          const sections: string[] = [];

          if (nativeResult) {
            sections.push(String(nativeResult));
          }

          if (facts.length > 0) {
            sections.push(formatFacts(facts));
          }

          if (nodes.length > 0) {
            // formatNodes has a leading "\n\n" — trim it when standalone
            sections.push(formatNodes(nodes).trim());
          }

          return sections.join("\n\n") || "No memories found.";
        },
      };

      return [wrappedSearchTool, memoryGetTool];
    },
    { names: ["memory_search", "memory_get"] },
  );

  // memory_add tool (stores to graph)
  const storeTool = createMemoryStoreTool(client, config, {
    name: "memory_add",
    description: "Store a thought, insight, reflection, or decision in memory. Conversations are already captured automatically — use this for higher-level reasoning, conclusions, and connections you want to preserve, not for recording what was said.",
  }, getGroupId);
  api.registerTool(storeTool);

  // Hooks — pass getNativeSearch so auto-recall can search both backends
  registerHooks(api, client, config, setGroupId, getNativeSearch);

  // Health monitor service
  registerHealthService(api, client);

  // CLI — native memory commands + gralkor commands
  api.registerCli(
    ({ program }) => {
      api.runtime.tools.registerMemoryCli(program);
    },
    { commands: ["memory"] },
  );
  registerCli(api, client, config);
}

export const id = "gralkor";
export const name = "Gralkor Memory";
export const description =
  "Persistent, temporally-aware memory via Graphiti knowledge graphs and FalkorDB";
export const kind = "memory" as const;

export const tools = ["memory_search", "memory_get", "memory_add"];

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
