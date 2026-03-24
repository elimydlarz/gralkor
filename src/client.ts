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

/** A filtered content block for episode ingestion. */
export interface EpisodeBlock {
  type: "text" | "thinking";
  text: string;
}

/** A filtered message for episode ingestion. */
export interface EpisodeMessage {
  role: "user" | "assistant";
  content: EpisodeBlock[];
}

export interface AddEpisodeParams {
  name: string;
  episode_body: string;
  source_description: string;
  group_id: string;
  source?: "message" | "text" | "json";
}

export interface IngestMessagesParams {
  name: string;
  source_description: string;
  group_id: string;
  messages: EpisodeMessage[];
}

export interface SearchResults {
  facts: Fact[];
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
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 2;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
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
            await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
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
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      } finally {
        clearTimeout(timer);
      }
    }

    throw lastError!;
  }

  async health(): Promise<{ status: string }> {
    return this.request("GET", "/health");
  }

  async addEpisode(params: AddEpisodeParams): Promise<Episode> {
    return this.request("POST", "/episodes", {
      ...params,
      reference_time: new Date().toISOString(),
    });
  }

  async ingest(params: IngestParams): Promise<Episode> {
    return this.request("POST", "/ingest", {
      ...params,
      reference_time: new Date().toISOString(),
    });
  }

  async search(
    query: string,
    groupIds: string[],
    limit = 10,
  ): Promise<SearchResults> {
    return this.request("POST", "/search", {
      query,
      group_ids: groupIds,
      num_results: limit,
    });
  }

  async getEpisodes(groupId: string, limit = 10): Promise<Episode[]> {
    return this.request(
      "GET",
      `/episodes?group_id=${encodeURIComponent(groupId)}&limit=${limit}`,
    );
  }

  async deleteEpisode(uuid: string): Promise<void> {
    await this.request("DELETE", `/episodes/${encodeURIComponent(uuid)}`);
  }

  async deleteEdge(uuid: string): Promise<void> {
    await this.request(
      "DELETE",
      `/edges/${encodeURIComponent(uuid)}`,
    );
  }

  async clearGraph(groupId: string): Promise<void> {
    await this.request("POST", "/clear", { group_id: groupId });
  }

  async getStatus(): Promise<{ status: string }> {
    return this.health();
  }
}
