import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphitiClient } from "./client.js";
import { resolveConfig, GRAPHITI_URL, type GralkorConfig } from "./config.js";
import {
  createMemoryStoreTool,
  formatFacts,
} from "./tools.js";
import {
  registerHooks,
  registerServerService,
  registerCli,
} from "./register.js";
import type { NativeSearchFn } from "./hooks.js";
import type { MemoryPluginApi } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginDir = join(__dirname, ".."); // dist/ → plugin root

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
  api: MemoryPluginApi,
  client: GraphitiClient,
  config: GralkorConfig,
  dir: string,
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
        const result = await originalExecute("auto-recall", { query });
        return unwrapToolResult(result);
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

          // Search native markdown and graph in parallel
          const [nativeRaw, searchResults] = await Promise.all([
            originalExecute(toolCallId, args, signal, onUpdate),
            client.search(args.query, [groupId], limit),
          ]);

          const nativeResult = unwrapToolResult(nativeRaw);

          console.log(`[gralkor] memory_search result — ${searchResults.facts.length} facts, ${nativeResult.length} native chars — groupId:${groupId}`);

          const sections: string[] = [];

          if (nativeResult) {
            sections.push(nativeResult);
          }

          if (searchResults.facts.length > 0) {
            sections.push(formatFacts(searchResults.facts));
          }

          const combinedResult = sections.join("\n\n") || "No memories found.";

          if (config.test) {
            console.log(`[gralkor] [test] memory_search result:\n${combinedResult}`);
          }

          return combinedResult;
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

  // Server manager (replaces health monitor)
  const manager = registerServerService(api, config, dir);

  // CLI — native memory commands + gralkor commands
  api.registerCli(
    ({ program }) => {
      api.runtime.tools.registerMemoryCli(program);
    },
    { commands: ["memory"] },
  );
  registerCli(api, client, config, manager);
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
        maxResults: { type: "number" as const, default: 10 },
      },
    },
    dataDir: {
      type: "string" as const,
      description: "Directory for backend data (venv, database). Defaults to .gralkor-data alongside the plugin directory.",
    },
    test: {
      type: "boolean" as const,
      default: false,
      description: "Enable test mode — logs full episode bodies and search results for debugging.",
    },
  },
};

export function register(api: MemoryPluginApi) {
  const config = resolveConfig((api.pluginConfig ?? {}) as Partial<GralkorConfig>);
  const client = new GraphitiClient({ baseUrl: GRAPHITI_URL });
  registerFullPlugin(api, client, config, pluginDir);
}

export default { id, name, description, kind, configSchema, register };
