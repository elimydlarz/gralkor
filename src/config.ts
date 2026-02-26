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
  graphitiUrl: "http://graphiti:8001",
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

export function resolveGroupId(ctx: { agentId?: string }): string {
  return ctx.agentId ?? "default";
}
