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

}


export const GRAPHITI_URL = "http://127.0.0.1:8001";
export const GRAPHITI_PORT = 8001;

export const DEFAULT_LLM_PROVIDER = "gemini";
export const DEFAULT_LLM_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_EMBEDDER_PROVIDER = "gemini";
export const DEFAULT_EMBEDDER_MODEL = "gemini-embedding-2-preview";

export interface GralkorConfig {
  autoCapture: { enabled: boolean };
  autoRecall: { enabled: boolean; maxResults: number };
  search: { maxResults: number; maxEntityResults: number };
  idleTimeoutMs: number;
  llm: ModelConfig;
  embedder?: ModelConfig;
  ontology?: OntologyConfig;
  dataDir?: string;
  workspaceDir?: string;
  test?: boolean;
  googleApiKey?: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  groqApiKey?: string;
}

export const defaultConfig: GralkorConfig = {
  autoCapture: { enabled: true },
  idleTimeoutMs: 5 * 60 * 1000,
  autoRecall: { enabled: true, maxResults: 10 },
  search: { maxResults: 20, maxEntityResults: 10 },
  llm: { provider: DEFAULT_LLM_PROVIDER, model: DEFAULT_LLM_MODEL },
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
    search: {
      maxResults: raw.search?.maxResults ?? defaultConfig.search.maxResults,
      maxEntityResults: raw.search?.maxEntityResults ?? defaultConfig.search.maxEntityResults,
    },
    llm: {
      provider: raw.llm?.provider ?? DEFAULT_LLM_PROVIDER,
      model: raw.llm?.model ?? DEFAULT_LLM_MODEL,
    },
    embedder: raw.embedder,
    ontology: raw.ontology,
    dataDir: raw.dataDir,
    workspaceDir: raw.workspaceDir,
    test: raw.test ?? false,
    googleApiKey: raw.googleApiKey,
    openaiApiKey: raw.openaiApiKey,
    anthropicApiKey: raw.anthropicApiKey,
    groqApiKey: raw.groqApiKey,
  };
}

export function resolveProviders(config: GralkorConfig) {
  return {
    llmProvider: config.llm.provider,
    llmModel: config.llm.model,
    embedderProvider: config.embedder?.provider ?? DEFAULT_EMBEDDER_PROVIDER,
    embedderModel: config.embedder?.model ?? DEFAULT_EMBEDDER_MODEL,
  };
}

/**
 * Normalize an agentId into a RediSearch-safe group_id.
 * Hyphens are special operators in RediSearch fulltext queries;
 * replacing them prevents syntax errors in graphiti-core's
 * fulltext search which embeds group_id in query strings.
 */
export function sanitizeGroupId(id: string): string {
  return id.replace(/-/g, "_");
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
