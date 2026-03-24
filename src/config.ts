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
