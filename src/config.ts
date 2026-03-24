export interface AutoCaptureConfig {
  enabled: boolean;
}

export interface AutoRecallConfig {
  enabled: boolean;
  maxResults: number;
}

export interface LlmConfig {
  provider: string;
  model: string;
}

export interface EmbedderConfig {
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

export const GRAPHITI_URL = "http://127.0.0.1:8001";
export const GRAPHITI_PORT = 8001;

export const DEFAULT_LLM_PROVIDER = "gemini";
export const DEFAULT_LLM_MODEL = "gemini-3-flash-preview";
export const DEFAULT_EMBEDDER_PROVIDER = "gemini";
export const DEFAULT_EMBEDDER_MODEL = "gemini-embedding-2-preview";

export interface GralkorConfig {
  autoCapture: AutoCaptureConfig;
  autoRecall: AutoRecallConfig;
  idleTimeoutMs: number;
  llm?: LlmConfig;
  embedder?: EmbedderConfig;
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

export function resolveGroupId(ctx: { agentId?: string }): string {
  return ctx.agentId ?? "default";
}

export const BOOTING_MSG = "Gralkor is still booting, but memory will be available soon.";

export interface ReadyGate {
  isReady(): boolean;
  resolve(): void;
}

export function createReadyGate(): ReadyGate {
  let ready = false;
  return {
    isReady: () => ready,
    resolve: () => { ready = true; },
  };
}
