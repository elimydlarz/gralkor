import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphitiClient } from "./client.js";
import { resolveConfig, validateOntologyConfig, GRAPHITI_URL, resolveProviders, createReadyGate, defaultConfig, type GralkorConfig } from "./config.js";
import {
  createMemoryStoreTool,
  formatFacts,
  INTERPRETATION_INSTRUCTION,
} from "./tools.js";
import {
  registerHooks,
  registerServerService,
  registerCli,
} from "./register.js";
import type { NativeSearchFn } from "./hooks.js";
import { countNativeResults } from "./hooks.js";
import type { MemoryPluginApi } from "./types.js";

// Lazy-loaded SDK imports for native memory search (avoids eager load of heavy modules)
type MemorySDK = {
  getMemorySearchManager: typeof import("openclaw/plugin-sdk/memory-core")["getMemorySearchManager"];
  readAgentMemoryFile: typeof import("openclaw/plugin-sdk/memory-core-host-runtime-files")["readAgentMemoryFile"];
  resolveSessionAgentId: typeof import("openclaw/plugin-sdk/memory-core-host-runtime-core")["resolveSessionAgentId"];
};
let memorySDKPromise: Promise<MemorySDK> | null = null;
async function loadMemorySDK(): Promise<MemorySDK> {
  memorySDKPromise ??= Promise.all([
    import("openclaw/plugin-sdk/memory-core"),
    import("openclaw/plugin-sdk/memory-core-host-runtime-files"),
    import("openclaw/plugin-sdk/memory-core-host-runtime-core"),
  ]).then(([core, files, runtimeCore]) => ({
    getMemorySearchManager: core.getMemorySearchManager,
    readAgentMemoryFile: files.readAgentMemoryFile,
    resolveSessionAgentId: runtimeCore.resolveSessionAgentId,
  }));
  return memorySDKPromise;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginDir = join(__dirname, ".."); // dist/ → plugin root

// OpenClaw calls register() 4+ times per event; only log config once
let configLogged = false;

// Guard against duplicate SIGTERM handlers across multiple register() calls
let sigTermHandlerInstalled = false;

/**
 * Search native Markdown memory via the OpenClaw memory SDK.
 * Returns JSON string matching memory-core's output format ({ results: [...] })
 * so countNativeResults() can parse it.
 */
async function searchNativeMemory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfg: any,
  agentId: string,
  query: string,
  opts?: { maxResults?: number; sessionKey?: string },
): Promise<string | null> {
  try {
    const { getMemorySearchManager } = await loadMemorySDK();
    const { manager, error } = await getMemorySearchManager({ cfg, agentId });
    if (!manager) {
      if (error) console.log(`[gralkor] native memory unavailable: ${error}`);
      return null;
    }
    const results = await manager.search(query, {
      maxResults: opts?.maxResults,
      sessionKey: opts?.sessionKey,
    });
    return JSON.stringify({ results });
  } catch (err) {
    console.log(`[gralkor] native memory search failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
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

  // Native memory tools via OpenClaw memory SDK (getMemorySearchManager)
  // The factory provides ctx.config and ctx.sessionKey at agent start
  api.registerTool(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (ctx: { config: any; sessionKey: string }) => {
      // Capture native search function for the auto-recall hook
      nativeSearchFn = async (query: string) => {
        return (await searchNativeMemory(ctx.config, getGroupId(), query, { sessionKey: ctx.sessionKey })) ?? "";
      };

      // memory_search: combines native Markdown + graph facts
      const memorySearchTool = {
        name: "memory_search",
        description: "Search memory for relevant context. Use specific, focused queries.",
        parameters: {
          type: "object" as const,
          properties: {
            query: { type: "string" as const },
            limit: { type: "number" as const },
          },
          required: ["query"],
        },
        async execute(
          toolCallId: string,
          args: { query: string; limit?: number },
        ): Promise<string> {
          const groupId = getGroupId();
          const limit = args.limit ?? 10;

          if (!serverReady.isReady()) {
            throw new Error("[gralkor] memory_search failed: server is not ready");
          }

          const [nativeResult, searchResults] = await Promise.all([
            searchNativeMemory(ctx.config, groupId, args.query, {
              maxResults: limit,
              sessionKey: ctx.sessionKey,
            }),
            client.search(args.query, [groupId], limit),
          ]);

          const factCount = searchResults.facts.length;
          const nativeCount = countNativeResults(nativeResult);

          console.log(`[gralkor] memory_search result — graph: ${factCount} facts, native: ${nativeCount} results — groupId:${groupId}`);

          const sections: string[] = [];

          if (nativeCount > 0) {
            sections.push(nativeResult!);
          }

          if (searchResults.facts.length > 0) {
            sections.push(formatFacts(searchResults.facts));
          }

          if (sections.length === 0) {
            return "No memories found.";
          }

          sections.push(INTERPRETATION_INSTRUCTION);

          const combinedResult = sections.join("\n\n");

          if (config.test) {
            console.log(`[gralkor] [test] memory_search result:\n${combinedResult}`);
          }

          return combinedResult;
        },
      };

      // memory_get: reads native Markdown memory files via SDK
      const memoryGetTool = {
        name: "memory_get",
        description:
          "Read a memory file by path with optional line range. Use after memory_search to pull specific sections.",
        parameters: {
          type: "object" as const,
          properties: {
            path: { type: "string" as const },
            from: { type: "number" as const },
            lines: { type: "number" as const },
          },
          required: ["path"],
        },
        async execute(
          _toolCallId: string,
          args: { path: string; from?: number; lines?: number },
        ): Promise<string> {
          try {
            const { readAgentMemoryFile } = await loadMemorySDK();
            const result = await readAgentMemoryFile({
              cfg: ctx.config,
              agentId: getGroupId(),
              relPath: args.path,
              from: args.from,
              lines: args.lines,
            });
            return JSON.stringify(result);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return JSON.stringify({ path: args.path, text: "", error: message });
          }
        },
      };

      return [memorySearchTool, memoryGetTool];
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

  // CLI — gralkor commands
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
    const { llmProvider, llmModel, embedderProvider, embedderModel } = resolveProviders(config);
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
