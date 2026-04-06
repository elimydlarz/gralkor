export interface Episode {
  uuid: string;
  name: string;
  content: string;
  source_description: string;
  group_id: string;
  created_at: string;
}

export interface Fact {
  uuid: string;
  name: string;
  fact: string;
  group_id: string;
  valid_at: string | null;
  invalid_at: string | null;
  expired_at: string | null;
  created_at: string;
}

export interface AddEpisodeParams {
  name: string;
  episode_body: string;
  source_description: string;
  group_id: string;
  source?: "message" | "text" | "json";
}

export interface IngestEpisodeParams {
  name: string;
  source_description: string;
  group_id: string;
  episode_body: string;
}

export type SearchMode = "fast" | "slow";

export interface EntityNode {
  uuid: string;
  name: string;
  summary: string | null;
  group_id: string;
}

export interface SearchResults {
  facts: Fact[];
  nodes: EntityNode[];
}

export interface HealthResponse {
  status: string;
  graph?: {
    connected: boolean;
    node_count?: number;
    edge_count?: number;
    error?: string;
  };
  data_dir?: string;
}

export interface GraphitiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  maxRetries?: number;
}

export class GraphitiClient {
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;

  constructor(options: GraphitiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;
    let attempt = 0;

    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let clientError: Error | undefined;

      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method,
          headers: body ? { "Content-Type": "application/json" } : undefined,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
          await new Promise<void>((resolve, reject) => {
            const sleep = setTimeout(resolve, retryAfter * 1000);
            controller.signal.addEventListener("abort", () => {
              clearTimeout(sleep);
              reject(controller.signal.reason ?? new DOMException("aborted", "AbortError"));
            });
          });
          continue; // does not consume the 5xx/network retry budget
        }

        if (!res.ok) {
          const text = await res.text().catch(() => "").then((t) => t.slice(0, 500));
          const err = new Error(
            `Graphiti ${method} ${path} returned ${res.status}: ${text}`,
          );
          // Don't retry client errors (4xx) — only server errors are transient
          if (res.status >= 400 && res.status < 500) {
            clientError = err;
            throw err;
          }
          lastError = err;
          if (attempt < this.maxRetries) {
            attempt++;
            await new Promise((r) => setTimeout(r, 500 * attempt));
          } else {
            throw lastError;
          }
          continue;
        }

        const contentType = res.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          return (await res.json()) as T;
        }
        return (await res.text()) as unknown as T;
      } catch (err) {
        if (clientError) throw clientError;
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < this.maxRetries) {
          attempt++;
          await new Promise((r) => setTimeout(r, 500 * attempt));
        } else {
          throw lastError;
        }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  async health(): Promise<HealthResponse> {
    return this.request("GET", "/health");
  }

  async addEpisode(params: AddEpisodeParams): Promise<Episode> {
    return this.request("POST", "/episodes", {
      ...params,
      idempotency_key: crypto.randomUUID(),
      reference_time: new Date().toISOString(),
    });
  }

  async ingestEpisode(params: IngestEpisodeParams): Promise<Episode> {
    return this.request("POST", "/episodes", {
      ...params,
      source: "message",
      idempotency_key: crypto.randomUUID(),
      reference_time: new Date().toISOString(),
    });
  }

  async search(
    query: string,
    groupIds: string[],
    limit = 10,
    mode: SearchMode = "fast",
  ): Promise<SearchResults> {
    return this.request("POST", "/search", {
      query,
      group_ids: groupIds,
      num_results: limit,
      mode,
    });
  }

  async buildIndices(): Promise<{ status: string }> {
    return this.request("POST", "/build-indices");
  }

  async buildCommunities(groupId: string): Promise<{ communities: number; edges: number }> {
    return this.request("POST", "/build-communities", { group_id: groupId });
  }

}
