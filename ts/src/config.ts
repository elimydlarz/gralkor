/**
 * Shared config types the server manager writes into `config.yaml` for the
 * Python server. OpenClaw-side plugin config (autoCapture, autoRecall,
 * search flags) lives in `@susu-eng/gralkor` (openclaw_gralkor) — this
 * package only holds types the Python server needs at boot.
 */

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

export const RESERVED_ENTITY_NAMES = new Set(["Entity", "Episodic", "Community", "Saga"]);

export const PROTECTED_ENTITY_ATTRS = new Set([
  "uuid", "name", "group_id", "labels", "created_at", "summary", "attributes", "name_embedding",
]);

export const PROTECTED_EDGE_ATTRS = new Set([
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

export const GRALKOR_URL = "http://127.0.0.1:4000";
export const GRALKOR_PORT = 4000;

export const DEFAULT_LLM_PROVIDER = "gemini";
export const DEFAULT_LLM_MODEL = "gemini-3.1-flash-lite-preview";
export const DEFAULT_EMBEDDER_PROVIDER = "gemini";
export const DEFAULT_EMBEDDER_MODEL = "gemini-embedding-2-preview";
