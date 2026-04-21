import type { GralkorClient, Message, Result } from "../client.js";

type Op =
  | "recall"
  | "capture"
  | "endSession"
  | "memorySearch"
  | "memoryAdd"
  | "healthCheck"
  | "buildIndices"
  | "buildCommunities";

/**
 * In-memory twin of {@link GralkorClient} for tests.
 *
 * Configure canned responses with {@link setResponse} before exercising the
 * code under test; inspect calls via the `recalls`, `captures`, `searches`,
 * `adds`, `endSessions`, `healthChecks` arrays afterwards. Operations with
 * no configured response return `{ error: "not_configured" }` so tests
 * must be explicit about the paths they exercise.
 */
export class GralkorInMemoryClient implements GralkorClient {
  private responses = new Map<Op, Result<unknown>>();

  readonly recalls: Array<[string, string, string]> = [];
  readonly captures: Array<[string, string, Message[]]> = [];
  readonly searches: Array<[string, string, string]> = [];
  readonly adds: Array<[string, string, string | null]> = [];
  readonly endSessions: Array<[string]> = [];
  readonly healthChecks: Array<[]> = [];
  readonly indicesBuilds: Array<[]> = [];
  readonly communitiesBuilds: Array<[string]> = [];

  setResponse(op: Op, response: Result<unknown>): void {
    this.responses.set(op, response);
  }

  reset(): void {
    this.responses.clear();
    this.recalls.length = 0;
    this.captures.length = 0;
    this.searches.length = 0;
    this.adds.length = 0;
    this.endSessions.length = 0;
    this.healthChecks.length = 0;
    this.indicesBuilds.length = 0;
    this.communitiesBuilds.length = 0;
  }

  private respond<T>(op: Op): Promise<Result<T>> {
    const r = this.responses.get(op) ?? { error: "not_configured" };
    return Promise.resolve(r as Result<T>);
  }

  async recall(groupId: string, sessionId: string, query: string): Promise<Result<string | null>> {
    this.recalls.push([groupId, sessionId, query]);
    return this.respond("recall");
  }

  async capture(sessionId: string, groupId: string, messages: Message[]): Promise<Result<true>> {
    this.captures.push([sessionId, groupId, messages]);
    return this.respond("capture");
  }

  async endSession(sessionId: string): Promise<Result<true>> {
    this.endSessions.push([sessionId]);
    return this.respond("endSession");
  }

  async memorySearch(groupId: string, sessionId: string, query: string): Promise<Result<string>> {
    this.searches.push([groupId, sessionId, query]);
    return this.respond("memorySearch");
  }

  async memoryAdd(
    groupId: string,
    content: string,
    sourceDescription: string | null,
  ): Promise<Result<true>> {
    this.adds.push([groupId, content, sourceDescription]);
    return this.respond("memoryAdd");
  }

  async healthCheck(): Promise<Result<true>> {
    this.healthChecks.push([]);
    return this.respond("healthCheck");
  }

  async buildIndices(): Promise<Result<{ status: string }>> {
    this.indicesBuilds.push([]);
    return this.respond("buildIndices");
  }

  async buildCommunities(
    groupId: string,
  ): Promise<Result<{ communities: number; edges: number }>> {
    this.communitiesBuilds.push([groupId]);
    return this.respond("buildCommunities");
  }
}
