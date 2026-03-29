export interface ModelConfig {
  provider: string;
  model: string;
}

export type OntologyAttributeValue =
  | string
  | string[]
  | { type: "string" | "int" | "float" | "bool" | "datetime"; description: string }
  | { enum: string[]; description: string };

export interface OntologyTypeDef {
  description: string;
  attributes?: Record<string, OntologyAttributeValue>;
}

export interface OntologyConfig {
  entities?: Record<string, OntologyTypeDef>;
  edges?: Record<string, OntologyTypeDef>;
  edgeMap?: Record<string, string[]>;
  excludedEntityTypes?: string[];
}

const RESERVED_ENTITY_NAMES = new Set(["Entity", "Episodic", "Community", "Saga"]);

const PROTECTED_ENTITY_ATTRS = new Set([
  "uuid", "name", "group_id", "labels", "created_at", "summary", "attributes", "name_embedding",
]);

const PROTECTED_EDGE_ATTRS = new Set([
  "uuid", "group_id", "source_node_uuid", "target_node_uuid", "created_at",
  "name", "fact", "fact_embedding", "episodes", "expired_at", "valid_at", "invalid_at", "attributes",
]);

export function validateOntologyConfig(ontology?: OntologyConfig): void {
  if (!ontology) return;

  const entityNames = new Set(Object.keys(ontology.entities ?? {}));
  const edgeNames = new Set(Object.keys(ontology.edges ?? {}));

  for (const name of entityNames) {
    if (RESERVED_ENTITY_NAMES.has(name)) {
      throw new Error(`Reserved entity name: '${name}' is used internally by Graphiti`);
    }
  }

  for (const [name, def] of Object.entries(ontology.entities ?? {})) {
    for (const attr of Object.keys(def.attributes ?? {})) {
      if (PROTECTED_ENTITY_ATTRS.has(attr)) {
        throw new Error(`Protected attribute '${attr}' on entity '${name}'`);
      }
    }
  }

  for (const [name, def] of Object.entries(ontology.edges ?? {})) {
    for (const attr of Object.keys(def.attributes ?? {})) {
      if (PROTECTED_EDGE_ATTRS.has(attr)) {
        throw new Error(`Protected attribute '${attr}' on edge '${name}'`);
      }
    }
  }

  for (const [key, edgeTypes] of Object.entries(ontology.edgeMap ?? {})) {
    const parts = key.split(",");
    if (parts.length !== 2) {
      throw new Error(`Invalid edgeMap key '${key}': expected 'EntityA,EntityB'`);
    }
    for (const part of parts) {
      if (!entityNames.has(part)) {
        throw new Error(`edgeMap references undeclared entity '${part}'`);
      }
    }
    for (const edge of edgeTypes) {
      if (!edgeNames.has(edge)) {
        throw new Error(`edgeMap references undeclared edge '${edge}'`);
      }
    }
  }

  if (ontology.excludedEntityTypes) {
    for (const name of ontology.excludedEntityTypes) {
      if (entityNames.has(name)) {
        throw new Error(`excludedEntityTypes contains declared entity '${name}' — contradictory`);
      }
    }
  }
}

export const PROVIDER_ENV_KEYS: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
};

export interface ConfigCheckResult {
  ok: boolean;
  checks: Array<{ label: string; status: "pass" | "fail" | "warn"; message: string }>;
}

export async function validateConfig(config: GralkorConfig): Promise<ConfigCheckResult> {
  const checks: ConfigCheckResult["checks"] = [];

  // LLM provider check
  const llmProvider = config.llm?.provider ?? DEFAULT_LLM_PROVIDER;
  const llmEnvKey = PROVIDER_ENV_KEYS[llmProvider];
  if (!llmEnvKey) {
    checks.push({ label: "LLM provider", status: "warn", message: `Unknown provider '${llmProvider}' — cannot verify API key` });
  } else if (process.env[llmEnvKey]) {
    checks.push({ label: "LLM provider", status: "pass", message: `${llmProvider} (${llmEnvKey} set)` });
  } else {
    checks.push({ label: "LLM provider", status: "fail", message: `${llmProvider} requires ${llmEnvKey}` });
  }

  // Embedder provider check
  const embedderProvider = config.embedder?.provider ?? DEFAULT_EMBEDDER_PROVIDER;
  const embedderEnvKey = PROVIDER_ENV_KEYS[embedderProvider];
  if (!embedderEnvKey) {
    checks.push({ label: "Embedder provider", status: "warn", message: `Unknown provider '${embedderProvider}' — cannot verify API key` });
  } else if (process.env[embedderEnvKey]) {
    checks.push({ label: "Embedder provider", status: "pass", message: `${embedderProvider} (${embedderEnvKey} set)` });
  } else {
    checks.push({ label: "Embedder provider", status: "fail", message: `${embedderProvider} requires ${embedderEnvKey}` });
  }

  // uv check
  try {
    const { execFile } = await import("node:child_process");
    const { promisify } = await import("node:util");
    const execFileAsync = promisify(execFile);
    await execFileAsync("uv", ["--version"]);
    checks.push({ label: "uv", status: "pass", message: "found on PATH" });
  } catch {
    checks.push({ label: "uv", status: "fail", message: "not found on PATH — install: curl -LsSf https://astral.sh/uv/install.sh | sh" });
  }

  return {
    ok: checks.every(c => c.status !== "fail"),
    checks,
  };
}

export const GRAPHITI_URL = "http://127.0.0.1:8001";
export const GRAPHITI_PORT = 8001;

export const DEFAULT_LLM_PROVIDER = "gemini";
export const DEFAULT_LLM_MODEL = "gemini-3-flash-preview";
export const DEFAULT_EMBEDDER_PROVIDER = "gemini";
export const DEFAULT_EMBEDDER_MODEL = "gemini-embedding-2-preview";

export interface GralkorConfig {
  autoCapture: { enabled: boolean };
  autoRecall: { enabled: boolean; maxResults: number };
  idleTimeoutMs: number;
  llm?: ModelConfig;
  embedder?: ModelConfig;
  ontology?: OntologyConfig;
  dataDir?: string;
  test?: boolean;
}

export const defaultConfig: GralkorConfig = {
  autoCapture: { enabled: true },
  idleTimeoutMs: 5 * 60 * 1000,
  autoRecall: { enabled: true, maxResults: 10 },
};

export function resolveConfig(raw: Partial<GralkorConfig> = {}): GralkorConfig {
  return {
    autoCapture: {
      enabled: raw.autoCapture?.enabled ?? defaultConfig.autoCapture.enabled,
    },
    idleTimeoutMs: raw.idleTimeoutMs ?? defaultConfig.idleTimeoutMs,
    autoRecall: {
      enabled: raw.autoRecall?.enabled ?? defaultConfig.autoRecall.enabled,
      maxResults:
        raw.autoRecall?.maxResults ?? defaultConfig.autoRecall.maxResults,
    },
    llm: raw.llm,
    embedder: raw.embedder,
    ontology: raw.ontology,
    dataDir: raw.dataDir,
    test: raw.test ?? false,
  };
}

export interface ReadyGate {
  isReady(): boolean;
  resolve(): void;
}

/**
 * Module-level ready gate — shared across all plugin instances within the
 * same process. This is critical because OpenClaw reloads the plugin 4+
 * times per event, each creating a new instance. If the gate were per-
 * instance, only the instance whose service `start()` ran would have a
 * resolved gate; hooks/tools from newer instances would see `false` and
 * silently skip graph calls even though the server is running fine.
 *
 * By making it module-level, the first `start()` resolves it and all
 * subsequent reloads inherit the resolved state.
 */
let moduleReady = false;

export function createReadyGate(): ReadyGate {
  return {
    isReady: () => moduleReady,
    resolve: () => { moduleReady = true; },
  };
}

/** Reset ready state. Only used in tests. */
export function resetReadyGate(): void {
  moduleReady = false;
}
