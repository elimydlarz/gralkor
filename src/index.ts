import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { GraphitiClient } from "./client.js";
import { resolveConfig, validateOntologyConfig, GRAPHITI_URL, resolveProviders, createReadyGate, defaultConfig, sanitizeGroupId, type GralkorConfig } from "./config.js";
import {
  createMemorySearchTool,
  createMemoryStoreTool,
  createBuildIndicesTool,
  createBuildCommunitiesTool,
} from "./tools.js";
import {
  registerHooks,
  registerServerService,
  registerCli,
} from "./register.js";
import type { MemoryPluginApi } from "./types.js";

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
  const setGroupId = (id: string) => { currentGroupId = sanitizeGroupId(id); };

  const toolOpts = { getGroupId, serverReady };
  api.registerTool(createMemorySearchTool(client, config, toolOpts));
  api.registerTool(createMemoryStoreTool(client, config, toolOpts));
  api.registerTool(createBuildIndicesTool(client, toolOpts));
  api.registerTool(createBuildCommunitiesTool(client, toolOpts));

  const debouncer = registerHooks(api, client, config, { setGroupId, serverReady });

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

  if (!config.dataDir) {
    throw new Error("[gralkor] dataDir is required — set plugins.entries.gralkor.config.dataDir");
  }
  if (!serverManager) {
    serverManager = registerServerService(api, config, dir, serverReady);
  }

  // CLI — gralkor commands
  registerCli(api, client, config, serverManager, config.dataDir);
}

export const id = "gralkor";
export const name = "Gralkor Memory";
export const description =
  "Persistent, temporally-aware memory via Graphiti knowledge graphs and FalkorDB";
export const kind = "memory" as const;

export const tools = ["memory_search", "memory_add"];

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
      description: "Required. Directory for persistent backend data (venv, FalkorDB database). Operator must set this path.",
    },
    workspaceDir: {
      type: "string" as const,
      description: "Native memory workspace root. Scanned at startup for MD files to index into the graph. Defaults to ~/.openclaw/workspace.",
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
