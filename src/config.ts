export interface AutoCaptureConfig {
  enabled: boolean;
}

export interface AutoRecallConfig {
  enabled: boolean;
  maxResults: number;
}

export type GroupIdStrategy = "per-user" | "per-conversation" | "global";

export interface GralkorConfig {
  graphitiUrl: string;
  groupIdStrategy: GroupIdStrategy;
  autoCapture: AutoCaptureConfig;
  autoRecall: AutoRecallConfig;
}

export const defaultConfig: GralkorConfig = {
  graphitiUrl: "http://localhost:8000",
  groupIdStrategy: "per-user",
  autoCapture: { enabled: true },
  autoRecall: { enabled: true, maxResults: 5 },
};

export function resolveConfig(raw: Partial<GralkorConfig> = {}): GralkorConfig {
  return {
    graphitiUrl: raw.graphitiUrl ?? defaultConfig.graphitiUrl,
    groupIdStrategy: raw.groupIdStrategy ?? defaultConfig.groupIdStrategy,
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

export function resolveGroupId(
  strategy: GroupIdStrategy,
  ctx: { senderId?: string; sessionKey?: string; channel?: string },
): string {
  switch (strategy) {
    case "per-user":
      return ctx.senderId ?? "anonymous";
    case "per-conversation":
      return ctx.sessionKey ?? `${ctx.channel ?? "default"}-${ctx.senderId ?? "anonymous"}`;
    case "global":
      return "gralkor";
  }
}
