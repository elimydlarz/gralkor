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

export function resolveGroupId(ctx: { agentId?: string }): string {
  return ctx.agentId ?? "default";
}

/** Candidate URLs in preference order: Docker networking, host-mapped port, legacy default. */
export const GRAPHITI_PROBE_URLS = [
  "http://graphiti:8000",
  "http://localhost:8001",
  "http://localhost:8000",
];

/**
 * Probe candidate URLs in parallel and return the first reachable one
 * (in preference order). Returns null if none respond.
 */
export async function probeGraphitiUrl(
  candidates: string[] = GRAPHITI_PROBE_URLS,
  timeoutMs = 2000,
): Promise<string | null> {
  const results = await Promise.allSettled(
    candidates.map(async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        if (res.ok) return url;
        throw new Error(`${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") return result.value;
  }
  return null;
}
