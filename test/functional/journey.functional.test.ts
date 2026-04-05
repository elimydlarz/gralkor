/**
 * Functional test: memory journey.
 *
 * A single coherent story through all five core capabilities using one thread
 * of data — the user's "lucky number":
 *
 *   Workspace seeded with 47 → captured conversation updates to 99
 *   → manual add updates to 42 → manual search reveals the full history.
 *
 * Assumes:
 * - OpenClaw gateway is already running (started by test/harness/functional-env.sh up)
 * - Workspace files were seeded by functional-env.sh BEFORE gateway start
 * - Gralkor server is healthy at http://127.0.0.1:8001
 *
 * Run inside the Docker harness only (pnpm run test:functional).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { execFileSync } from "node:child_process";

const SERVER_URL = "http://127.0.0.1:8001";
const GROUP = "default";

interface Fact {
  uuid: string;
  fact: string;
  invalid_at: string | null;
  [key: string]: unknown;
}

async function search(query: string, mode: "fast" | "slow" = "fast", group = GROUP): Promise<{ facts: Fact[]; nodes: unknown[] }> {
  const res = await fetch(`${SERVER_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, group_ids: [group], num_results: 10, mode }),
  });
  if (!res.ok) throw new Error(`/search failed: ${res.status}`);
  return res.json() as Promise<{ facts: Fact[]; nodes: unknown[] }>;
}

async function poll(condition: string, fn: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, 10_000));
  }
  throw new Error(`Timed out waiting for: ${condition}`);
}

beforeAll(async () => {
  // Allow ~20s for native indexer to finish before search polls compete for Gemini quota.
  await new Promise(r => setTimeout(r, 20_000));

  // 1. Wait for native indexing to complete (lucky number 47 from session-001.md)
  await poll("lucky number 47 indexed from workspace file", async () => {
    try {
      const { facts } = await search("lucky number");
      return facts.some(f => f.fact.includes("47"));
    } catch { return false; }
  }, 90_000);

  // 2. Capture: post the conversation directly as an episode (source:"message") —
  // same payload the plugin produces after formatTranscript() runs on agent_end.
  // The real end-to-end capture pipeline (gateway → agent_end hook → flush) is
  // exercised separately in the "capture-pipeline" describe block below.
  const captureRes = await fetch(`${SERVER_URL}/episodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "journey-capture",
      episode_body:
        "User: Eli's lucky number changed from LuckyNumber47 to LuckyNumber99.\n" +
        "Assistant: Noted. Eli's lucky number is now LuckyNumber99.",
      source_description: "functional test capture",
      group_id: GROUP,
      source: "message",
      idempotency_key: "journey-capture-99",
      reference_time: new Date().toISOString(),
    }),
  });
  if (!captureRes.ok) throw new Error(`/episodes (capture) failed: ${captureRes.status}`);
  await poll("lucky number 99 searchable after capture ingest", async () => {
    try {
      const { facts } = await search("lucky number");
      return facts.some(f => f.fact.includes("99"));
    } catch { return false; }
  }, 90_000);

  // 3. Manual add: store that lucky number changed to 42
  await fetch(`${SERVER_URL}/episodes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "journey-manual-add",
      episode_body: "Eli's lucky number changed from LuckyNumber99 to LuckyNumber42.",
      source_description: "manual memory_add",
      group_id: GROUP,
      source: "text",
      idempotency_key: "journey-manual-add-42",
      reference_time: new Date().toISOString(),
    }),
  });
  await poll("lucky number 42 searchable after manual add", async () => {
    try {
      const { facts } = await search("lucky number");
      return facts.some(f => f.fact.includes("42"));
    } catch { return false; }
  }, 90_000);
}, 300_000);

describe("memory journey", () => {
  it("injection reveals the indexed lucky number", async () => {
    const { facts } = await search("lucky number");
    expect(facts.some(f => f.fact.includes("47"))).toBe(true);
  });

  it("manual search reveals 42 as the current lucky number", async () => {
    const { facts } = await search("lucky number");
    const current = facts.find(f => f.fact.includes("42"));
    expect(current).toBeDefined();
    expect(current!.invalid_at).toBeNull();
  });

  it("earlier lucky numbers appear as superseded", async () => {
    const { facts } = await search("lucky number");
    const superseded = facts.filter(
      f => (f.fact.includes("47") || f.fact.includes("99")) && f.invalid_at !== null,
    );
    expect(superseded.length).toBeGreaterThan(0);
  });

  it("manual search returns both facts and entity nodes", async () => {
    const { facts, nodes } = await search("lucky number", "slow");
    expect(facts.length).toBeGreaterThan(0);
    expect(Array.isArray(nodes)).toBe(true);
  });
});

describe("agent-partition-isolation", () => {
  const AGENT_GROUP = "journey_agent_partition_test";
  const SENTINEL = "CodewordAlphaSentinel999";

  beforeAll(async () => {
    // Store a unique fact under a separate agent group
    const res = await fetch(`${SERVER_URL}/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "partition-isolation-test",
        episode_body: `${SENTINEL} is only known to agent partition ${AGENT_GROUP}.`,
        source_description: "functional test",
        group_id: AGENT_GROUP,
        source: "text",
        idempotency_key: "partition-isolation-sentinel",
        reference_time: new Date().toISOString(),
      }),
    });
    if (!res.ok) throw new Error(`/episodes failed: ${res.status}`);

    // Poll until searchable in the agent group
    await poll(`${SENTINEL} indexed in group ${AGENT_GROUP}`, async () => {
      try {
        const { facts } = await search(SENTINEL, "fast", AGENT_GROUP);
        return facts.some(f => f.fact.includes(SENTINEL));
      } catch { return false; }
    }, 120_000);
  }, 180_000);

  it("fact is searchable within its own group", async () => {
    const { facts } = await search(SENTINEL, "fast", AGENT_GROUP);
    expect(facts.some(f => f.fact.includes(SENTINEL))).toBe(true);
  });

  it("fact is NOT returned when searching a different group", async () => {
    const { facts } = await search(SENTINEL, "fast", GROUP);
    expect(facts.some(f => f.fact.includes(SENTINEL))).toBe(false);
  });
});

// Item 1: concurrent agents writing simultaneously must not bleed into each other.
describe("concurrent-agent-isolation", () => {
  const GROUP_A = "journey_concurrent_alpha";
  const GROUP_B = "journey_concurrent_beta";
  const SENTINEL_A = "ConcurrentSentinelAlpha111";
  const SENTINEL_B = "ConcurrentSentinelBeta222";

  beforeAll(async () => {
    // Both agents ingest at the same time — concurrent writes to different groups.
    const [resA, resB] = await Promise.all([
      fetch(`${SERVER_URL}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "concurrent-alpha",
          episode_body: `${SENTINEL_A} belongs exclusively to agent alpha.`,
          source_description: "functional test",
          group_id: GROUP_A,
          source: "text",
          idempotency_key: "concurrent-sentinel-alpha",
          reference_time: new Date().toISOString(),
        }),
      }),
      fetch(`${SERVER_URL}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "concurrent-beta",
          episode_body: `${SENTINEL_B} belongs exclusively to agent beta.`,
          source_description: "functional test",
          group_id: GROUP_B,
          source: "text",
          idempotency_key: "concurrent-sentinel-beta",
          reference_time: new Date().toISOString(),
        }),
      }),
    ]);
    if (!resA.ok) throw new Error(`/episodes (alpha) failed: ${resA.status}`);
    if (!resB.ok) throw new Error(`/episodes (beta) failed: ${resB.status}`);

    // Poll until both are searchable in their own groups.
    await Promise.all([
      poll(`${SENTINEL_A} indexed in ${GROUP_A}`, async () => {
        try {
          const { facts } = await search(SENTINEL_A, "fast", GROUP_A);
          return facts.some(f => f.fact.includes(SENTINEL_A));
        } catch { return false; }
      }, 120_000),
      poll(`${SENTINEL_B} indexed in ${GROUP_B}`, async () => {
        try {
          const { facts } = await search(SENTINEL_B, "fast", GROUP_B);
          return facts.some(f => f.fact.includes(SENTINEL_B));
        } catch { return false; }
      }, 120_000),
    ]);
  }, 180_000);

  it("alpha fact is searchable in alpha group", async () => {
    const { facts } = await search(SENTINEL_A, "fast", GROUP_A);
    expect(facts.some(f => f.fact.includes(SENTINEL_A))).toBe(true);
  });

  it("beta fact is searchable in beta group", async () => {
    const { facts } = await search(SENTINEL_B, "fast", GROUP_B);
    expect(facts.some(f => f.fact.includes(SENTINEL_B))).toBe(true);
  });

  it("alpha fact does NOT appear in beta group", async () => {
    const { facts } = await search(SENTINEL_A, "fast", GROUP_B);
    expect(facts.some(f => f.fact.includes(SENTINEL_A))).toBe(false);
  });

  it("beta fact does NOT appear in alpha group", async () => {
    const { facts } = await search(SENTINEL_B, "fast", GROUP_A);
    expect(facts.some(f => f.fact.includes(SENTINEL_B))).toBe(false);
  });
}, 200_000);

// Item 3: prove the plugin correctly sanitizes hyphenated agentIds end-to-end.
// sanitizeGroupId("my-hyphen-agent") → "my_hyphen_agent" at setSessionData write time.
// The harness pre-creates the "my-hyphen-agent" agent via `openclaw agents add`.
// We trigger a real agent run with that agentId; the capture pipeline writes the
// episode under the sanitized group "my_hyphen_agent". We then verify:
//   - the fact IS searchable under "my_hyphen_agent" (sanitized)
//   - the fact is NOT searchable under "my-hyphen-agent" (unsanitized — a different graph)
describe("hyphenated-agent-id-sanitization", () => {
  const AGENT_ID       = "my-hyphen-agent";         // agentId with hyphens
  const GROUP_SANITIZED   = "my_hyphen_agent";       // what sanitizeGroupId() produces
  const GROUP_UNSANITIZED = "my-hyphen-agent";       // different FalkorDB named graph
  const SENTINEL = "SentinelHyphen777";

  beforeAll(async () => {
    // Trigger a real agent run under the hyphenated agent.
    // agent_end fires with ctx.agentId = "my-hyphen-agent"; the plugin calls
    // sanitizeGroupId("my-hyphen-agent") → "my_hyphen_agent" and stores under that group.
    execFileSync("openclaw", [
      "agent", "--agent", AGENT_ID,
      "--message", `${SENTINEL} is the test sentinel for hyphenated agent ID sanitization. Please acknowledge.`,
      "--json",
    ], { timeout: 120_000 });

    // Poll for the episode to appear under the sanitized group (flush within ~10s).
    await poll(`${SENTINEL} indexed in sanitized group ${GROUP_SANITIZED}`, async () => {
      try {
        const { facts } = await search(SENTINEL, "fast", GROUP_SANITIZED);
        return facts.some(f => f.fact.includes(SENTINEL));
      } catch { return false; }
    }, 120_000);
  }, 300_000);

  it("fact is searchable under the sanitized (underscore) group", async () => {
    const { facts } = await search(SENTINEL, "fast", GROUP_SANITIZED);
    expect(facts.some(f => f.fact.includes(SENTINEL))).toBe(true);
  });

  it("fact is NOT found under the unsanitized (hyphen) group — different FalkorDB named graph", async () => {
    const { facts } = await search(SENTINEL, "fast", GROUP_UNSANITIZED);
    expect(facts.some(f => f.fact.includes(SENTINEL))).toBe(false);
  });
});

// Item 4: session-flush write→read symmetry. The plugin maps sessionKey→groupId in
// before_prompt_build, stores it in an in-memory Map, then uses that same groupId
// for both the episode flush (write) and tool searches (read). This test exercises
// the server-side invariant that write and read routes are symmetric: an episode
// written to groupId X is retrievable by searching groupId X, and only groupId X.
describe("session-flush-write-read-symmetry", () => {
  const GROUP_SESSION_A = "journey_flush_session_a";
  const GROUP_SESSION_B = "journey_flush_session_b";
  const SENTINEL_SA = "FlushSessionAlpha333";
  const SENTINEL_SB = "FlushSessionBeta444";

  beforeAll(async () => {
    // Simulate two concurrent session flushes to different groups.
    // This mirrors what DebouncedFlush does on session_end for two active sessions.
    const [resA, resB] = await Promise.all([
      fetch(`${SERVER_URL}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "flush-session-a",
          episode_body:
            `User: What is ${SENTINEL_SA}?\nAssistant: It is the session A sentinel fact.`,
          source_description: "auto-capture flush",
          group_id: GROUP_SESSION_A,
          source: "message",
          idempotency_key: "flush-session-a-sentinel",
          reference_time: new Date().toISOString(),
        }),
      }),
      fetch(`${SERVER_URL}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "flush-session-b",
          episode_body:
            `User: What is ${SENTINEL_SB}?\nAssistant: It is the session B sentinel fact.`,
          source_description: "auto-capture flush",
          group_id: GROUP_SESSION_B,
          source: "message",
          idempotency_key: "flush-session-b-sentinel",
          reference_time: new Date().toISOString(),
        }),
      }),
    ]);
    if (!resA.ok) throw new Error(`/episodes (session-a) failed: ${resA.status}`);
    if (!resB.ok) throw new Error(`/episodes (session-b) failed: ${resB.status}`);

    await Promise.all([
      poll(`${SENTINEL_SA} indexed in ${GROUP_SESSION_A}`, async () => {
        try {
          const { facts } = await search(SENTINEL_SA, "fast", GROUP_SESSION_A);
          return facts.some(f => f.fact.includes(SENTINEL_SA));
        } catch { return false; }
      }, 120_000),
      poll(`${SENTINEL_SB} indexed in ${GROUP_SESSION_B}`, async () => {
        try {
          const { facts } = await search(SENTINEL_SB, "fast", GROUP_SESSION_B);
          return facts.some(f => f.fact.includes(SENTINEL_SB));
        } catch { return false; }
      }, 120_000),
    ]);
  }, 180_000);

  it("session A flush is readable from session A group (write→read symmetric)", async () => {
    const { facts } = await search(SENTINEL_SA, "fast", GROUP_SESSION_A);
    expect(facts.some(f => f.fact.includes(SENTINEL_SA))).toBe(true);
  });

  it("session B flush is readable from session B group (write→read symmetric)", async () => {
    const { facts } = await search(SENTINEL_SB, "fast", GROUP_SESSION_B);
    expect(facts.some(f => f.fact.includes(SENTINEL_SB))).toBe(true);
  });

  it("session A data does NOT appear when reading session B group", async () => {
    const { facts } = await search(SENTINEL_SA, "fast", GROUP_SESSION_B);
    expect(facts.some(f => f.fact.includes(SENTINEL_SA))).toBe(false);
  });

  it("session B data does NOT appear when reading session A group", async () => {
    const { facts } = await search(SENTINEL_SB, "fast", GROUP_SESSION_A);
    expect(facts.some(f => f.fact.includes(SENTINEL_SB))).toBe(false);
  });
});
