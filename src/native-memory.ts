/**
 * Native memory delegation — searches OpenClaw's built-in Markdown memory
 * via the memory SDK. Lazy-loads SDK modules at runtime (not available at build time).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MemorySDK = {
  getMemorySearchManager: (params: {
    cfg: unknown;
    agentId: string;
    purpose?: "default" | "status";
  }) => Promise<{ manager: MemorySearchManager | null; error?: string }>;
  readAgentMemoryFile: (params: {
    cfg: unknown;
    agentId: string;
    relPath: string;
    from?: number;
    lines?: number;
  }) => Promise<{ text: string; path: string }>;
};

export interface MemorySearchManager {
  search(
    query: string,
    opts?: { maxResults?: number; minScore?: number; sessionKey?: string },
  ): Promise<Array<{ path: string; startLine: number; endLine: number; score: number; snippet: string; source: string }>>;
  readFile(params: { relPath: string; from?: number; lines?: number }): Promise<{ text: string; path: string }>;
}

let memorySDKPromise: Promise<MemorySDK> | null = null;

export function loadMemorySDK(): Promise<MemorySDK> {
  // Dynamic import paths constructed to prevent TypeScript from resolving them
  // at build time — these modules are provided by the OpenClaw host at runtime.
  const sdkBase = "openclaw/plugin-sdk";
  memorySDKPromise ??= Promise.all([
    import(/* @vite-ignore */ `${sdkBase}/memory-core`),
    import(/* @vite-ignore */ `${sdkBase}/memory-core-host-runtime-files`),
  ]).then(([core, files]) => ({
    getMemorySearchManager: core.getMemorySearchManager,
    readAgentMemoryFile: files.readAgentMemoryFile,
  }));
  return memorySDKPromise;
}

/** Reset the cached SDK promise (for testing). */
export function resetMemorySDK(): void {
  memorySDKPromise = null;
}

/**
 * Search native Markdown memory via the OpenClaw memory SDK.
 * Returns JSON string matching memory-core's output format ({ results: [...] })
 * so countNativeResults() can parse it.
 */
export async function searchNativeMemory(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfg: any,
  agentId: string,
  query: string,
  opts?: { maxResults?: number; sessionKey?: string },
): Promise<string | null> {
  try {
    const { getMemorySearchManager } = await loadMemorySDK();
    const { manager, error } = await getMemorySearchManager({ cfg, agentId });
    if (!manager) {
      if (error) console.log(`[gralkor] native memory unavailable: ${error}`);
      return null;
    }
    const results = await manager.search(query, {
      maxResults: opts?.maxResults,
      sessionKey: opts?.sessionKey,
    });
    return JSON.stringify({ results });
  } catch (err) {
    console.log(`[gralkor] native memory search failed: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

/**
 * Read a native memory file via the OpenClaw memory SDK.
 */
export async function readNativeMemoryFile(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cfg: any,
  agentId: string,
  relPath: string,
  opts?: { from?: number; lines?: number },
): Promise<string> {
  try {
    const { readAgentMemoryFile } = await loadMemorySDK();
    const result = await readAgentMemoryFile({
      cfg,
      agentId,
      relPath,
      from: opts?.from,
      lines: opts?.lines,
    });
    return JSON.stringify(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ path: relPath, text: "", error: message });
  }
}
