import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphitiClient } from "./client.js";
import { resolveConfig, validateOntologyConfig, GRAPHITI_URL, resolveProviders, createReadyGate, defaultConfig, sanitizeGroupId, type GralkorConfig } from "./config.js";
import {
  createMemoryStoreTool,
  createBuildIndicesTool,
  createBuildCommunitiesTool,
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
import { searchNativeMemory, readNativeMemoryFile } from "./native-memory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginDir = join(__dirname, ".."); // dist/ → plugin root

let version = "unknown";
try {
  version = JSON.parse(readFileSync(join(pluginDir, "package.json"), "utf-8")).version ?? "unknown";
} catch { /* not critical */ }

// Guard: only log config once per process (module may be re-evaluated on reload)
let configLogged = false;

// Guard against duplicate SIGTERM handlers across multiple register() calls
let sigTermHandlerInstalled = false;

// Cached server manager — survives register() reloads so we don't spawn twice
let serverManager: ReturnType<typeof registerServerService> | undefined;

/** @internal Reset module-level guards for testing only.
 *  Does NOT reset sigTermHandlerInstalled — handlers can't be cleanly removed. */
export function _resetForTesting() {
  configLogged = false;
  serverManager = undefined;
  sigTermHandlerInstalled = false;
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
            console.log(`[gralkor] [test] memory_search query: ${args.query}`);
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
          return readNativeMemoryFile(ctx.config, getGroupId(), args.path, {
            from: args.from,
            lines: args.lines,
          });
        },
      };

      return [memorySearchTool, memoryGetTool];
    },
    { names: ["memory_search", "memory_get"] },
  );

  const toolOpts = { getGroupId, serverReady };
  api.registerTool(createMemoryStoreTool(client, config, toolOpts));
  api.registerTool(createBuildIndicesTool(client, toolOpts));
  api.registerTool(createBuildCommunitiesTool(client, toolOpts));

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
  if (!serverManager) {
    serverManager = registerServerService(api, config, dir, serverReady);
  }

  // CLI — gralkor commands
  registerCli(api, client, config, serverManager, resolvedDataDir);
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
    googleApiKey: {
      type: "string" as const,
      description: "Google API key for Gemini LLM and embeddings",
    },
    openaiApiKey: {
      type: "string" as const,
      description: "OpenAI API key; also needed for embeddings with Anthropic/Groq providers",
    },
    anthropicApiKey: {
      type: "string" as const,
      description: "Anthropic API key for Claude-based LLM extraction",
    },
    groqApiKey: {
      type: "string" as const,
      description: "Groq API key for Groq-hosted LLM extraction",
    },
  },
};

export function register(api: MemoryPluginApi) {
  try {
    const config = resolveConfig((api.pluginConfig ?? {}) as Partial<GralkorConfig>);
    validateOntologyConfig(config.ontology);

    if (!configLogged) {
      configLogged = true;
      console.log(`[gralkor] boot: plugin loaded (v${version})`);
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
  } catch (err) {
    console.error(`[gralkor] boot: register() failed:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

export default { id, name, description, kind, configSchema, register };
