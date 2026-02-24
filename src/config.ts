export interface AutoCaptureConfig {
  enabled: boolean;
}

export interface AutoRecallConfig {
  enabled: boolean;
  maxResults: number;
}

export interface GralkorConfig {
  graphitiUrl: string;
  autoCapture: AutoCaptureConfig;
  autoRecall: AutoRecallConfig;
}

export const defaultConfig: GralkorConfig = {
  graphitiUrl: "http://localhost:8000",
  autoCapture: { enabled: true },
  autoRecall: { enabled: true, maxResults: 5 },
};

export function resolveConfig(raw: Partial<GralkorConfig> = {}): GralkorConfig {
  return {
    graphitiUrl: raw.graphitiUrl ?? defaultConfig.graphitiUrl,
    autoCapture: {
      enabled: raw.autoCapture?.enabled ?? defaultConfig.autoCapture.enabled,
    },
    autoRecall: {
      enabled: raw.autoRecall?.enabled ?? defaultConfig.autoRecall.enabled,
      maxResults:
        raw.autoRecall?.maxResults ?? defaultConfig.autoRecall.maxResults,
    },
  };
}

export const SHARED_GROUP_ID = "agent-family";

export function resolveGroupIds(
  ctx: { agentId?: string },
): { agent: string; shared: string } {
  return {
    agent: ctx.agentId ?? "default",
    shared: SHARED_GROUP_ID,
  };
}
