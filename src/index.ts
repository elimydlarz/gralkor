import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphitiClient } from "./client.js";
import { resolveConfig, validateOntologyConfig, GRAPHITI_URL, DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL, DEFAULT_EMBEDDER_PROVIDER, DEFAULT_EMBEDDER_MODEL, createReadyGate, defaultConfig, type GralkorConfig } from "./config.js";
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
import { countNativeResults } from "./hooks.js";
import type { MemoryPluginApi } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginDir = join(__dirname, ".."); // dist/ → plugin root

// OpenClaw calls register() 4+ times per event; only log config once
let configLogged = false;

// Guard against duplicate SIGTERM handlers across multiple register() calls
let sigTermHandlerInstalled = false;

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
  const serverReady = createReadyGate();

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
        description:
          "Search memory for relevant context. Use specific, focused queries.",
        async execute(
          toolCallId: string,
          args: { query: string; limit?: number },
          signal?: AbortSignal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onUpdate?: any,
        ): Promise<string> {
          const groupId = getGroupId();
          const limit = args.limit ?? 10;

          if (!serverReady.isReady()) {
            throw new Error("[gralkor] memory_search failed: server is not ready");
          }

          const [nativeRaw, searchResults] = await Promise.all([
            originalExecute(toolCallId, args, signal, onUpdate),
            client.search(args.query, [groupId], limit),
          ]);

          const nativeResult = unwrapToolResult(nativeRaw);
          const factCount = searchResults.facts.length;
          const nativeCount = countNativeResults(nativeResult);

          console.log(`[gralkor] memory_search result — graph: ${factCount} facts, native: ${nativeCount} results — groupId:${groupId}`);

          const sections: string[] = [];

          if (nativeCount > 0) {
            sections.push(nativeResult);
          }

          if (searchResults.facts.length > 0) {
            sections.push(formatFacts(searchResults.facts));
          }

          if (sections.length === 0) {
            return "No memories found.";
          }

          const interpretation =
            "Before responding, interpret these facts for relevance to the task at hand. " +
            "Doing this step thoughtfully improves response quality significantly.";
          sections.push(interpretation);

          const combinedResult = sections.join("\n\n");

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

  const storeTool = createMemoryStoreTool(client, config, {
    getGroupId,
    serverReady,
  });
  api.registerTool(storeTool);

  const debouncer = registerHooks(api, client, config, { setGroupId, getNativeSearch, serverReady });

  // Flush pending session buffers on SIGTERM to prevent data loss on shutdown
  if (!sigTermHandlerInstalled) {
    sigTermHandlerInstalled = true;
    process.on("SIGTERM", () => {
      if (debouncer.pendingCount > 0) {
        console.log(`[gralkor] SIGTERM received, flushing ${debouncer.pendingCount} pending session buffer(s)...`);
        debouncer.flushAll().catch((err) => {
          console.error("[gralkor] SIGTERM flush failed:", err instanceof Error ? err.message : err);
        });
      }
    });
  }

  const resolvedDataDir = config.dataDir ?? join(dir, "..", ".gralkor-data");
  const manager = registerServerService(api, config, dir, serverReady);

  // CLI — native memory commands + gralkor commands
  api.registerCli(
    ({ program }) => {
      api.runtime.tools.registerMemoryCli(program);
    },
    { commands: ["memory"] },
  );
  registerCli(api, client, config, manager, resolvedDataDir);
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
        enabled: { type: "boolean" as const, default: defaultConfig.autoCapture.enabled },
      },
    },
    autoRecall: {
      type: "object" as const,
      properties: {
        enabled: { type: "boolean" as const, default: defaultConfig.autoRecall.enabled },
        maxResults: { type: "number" as const, default: defaultConfig.autoRecall.maxResults },
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
  validateOntologyConfig(config.ontology);

  if (!configLogged) {
    configLogged = true;
    if (config.test) {
      console.log(`[gralkor] raw pluginConfig: ${JSON.stringify(api.pluginConfig)}`);
    }
    const llmProvider = config.llm?.provider ?? DEFAULT_LLM_PROVIDER;
    const llmModel = config.llm?.model ?? DEFAULT_LLM_MODEL;
    const embedderProvider = config.embedder?.provider ?? DEFAULT_EMBEDDER_PROVIDER;
    const embedderModel = config.embedder?.model ?? DEFAULT_EMBEDDER_MODEL;
    const ontologySummary = config.ontology
      ? `${Object.keys(config.ontology.entities ?? {}).length} entities, ${Object.keys(config.ontology.edges ?? {}).length} edges`
      : "none";
    console.log(
      `[gralkor] config:` +
      ` llm=${llmProvider}/${llmModel}` +
      ` embedder=${embedderProvider}/${embedderModel}` +
      ` ontology=${ontologySummary}` +
      ` autoCapture=${config.autoCapture.enabled}` +
      ` autoRecall=${config.autoRecall.enabled} maxResults=${config.autoRecall.maxResults}` +
      ` idleTimeout=${config.idleTimeoutMs}ms` +
      ` test=${config.test}` +
      ` dataDir=${config.dataDir ?? 'default'}`
    );
  }
  const client = new GraphitiClient({ baseUrl: GRAPHITI_URL });
  registerFullPlugin(api, client, config, pluginDir);
}

export default { id, name, description, kind, configSchema, register };
