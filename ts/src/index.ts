export type {
  GralkorClient,
  Message,
  Result,
  Role,
} from "./client.js";

export { sanitizeGroupId, isOk, isErr } from "./client.js";

export { GralkorHttpClient } from "./client/http.js";
export type { GralkorHttpClientOptions } from "./client/http.js";

export { waitForHealth } from "./connection.js";
export type { WaitForHealthOptions } from "./connection.js";

export { createServerManager, bundledServerDir } from "./server-manager.js";
export type { ServerManager, ServerManagerOptions } from "./server-manager.js";

export type {
  ModelConfig,
  OntologyConfig,
  OntologyAttributeValue,
  OntologyTypeDef,
} from "./config.js";

export {
  validateOntologyConfig,
  GRALKOR_URL,
  GRALKOR_PORT,
} from "./config.js";
