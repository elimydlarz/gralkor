/**
 * Functional test: memory journey.
 *
 * A sequential story through all five core capabilities using a single thread
 * of data — the user's "lucky number" — to verify end-to-end behaviour:
 *
 *   1. Native indexing  — workspace file seeded with 47 → indexed at boot
 *   2. Injection        — 47 is searchable (what auto-recall uses)
 *   3. Capture          — conversation updates lucky number to 99 → searchable
 *   4. Manual add       — memory_add stores lucky number changed to 42
 *   5. Manual search    — 42 is current; earlier values are superseded
 *
 * Assumes:
 * - OpenClaw gateway is already running (started by test/harness/run.sh)
 * - Workspace files were seeded by run.sh BEFORE gateway start
 * - Gralkor server is healthy at http://127.0.0.1:8001
 * - Native indexer has completed (native-indexing test must have already run)
 *
 * Tests run in order — each step builds on the previous.
 * Run inside the Docker harness only (pnpm run test:functional).
 */
import { describe, it, expect } from "vitest";

const SERVER_URL = "http://127.0.0.1:8001";
const GROUP = "default";

interface Fact {
  uuid: string;
  name: string;
  fact: string;
  group_id: string;
  valid_at: string | null;
  invalid_at: string | null;
  expired_at: string | null;
  created_at: string;
}

async function search(query: string, mode: "fast" | "slow" = "fast"): Promise<{ facts: Fact[]; nodes: unknown[] }> {
  const res = await fetch(`${SERVER_URL}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, group_ids: [GROUP], num_results: 10, mode }),
  });
  if (!res.ok) throw new Error(`/search failed: ${res.status}`);
  return res.json() as Promise<{ facts: Fact[]; nodes: unknown[] }>;
}

async function poll(
  fn: () => Promise<boolean>,
  timeoutMs = 60_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      if (await fn()) return;
    } catch (e) {
      last = e;
    }
    await new Promise(r => setTimeout(r, 2_000));
  }
  throw new Error(`Timed out waiting for condition${last ? `: ${last}` : ""}`);
}

function factsContain(facts: Fact[], value: string): boolean {
  return facts.some(f => f.fact.includes(value));
}

describe("memory journey", () => {
  it("injection — seeded lucky number 47 is searchable (auto-recall mechanism)", async () => {
    // Native indexer ran at boot and indexed session-001.md ("My lucky number is 47.")
    // This is the same search auto-recall performs before each turn.
    await poll(async () => {
      const { facts } = await search("lucky number");
      return factsContain(facts, "47");
    });

    const { facts } = await search("lucky number");
    expect(factsContain(facts, "47")).toBe(true);
  }, 90_000);

  it("capture — conversation establishing lucky number 99 becomes searchable", async () => {
    const res = await fetch(`${SERVER_URL}/ingest-messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "journey-capture",
        source_description: "functional test capture",
        group_id: GROUP,
        idempotency_key: "journey-capture-99",
        reference_time: new Date().toISOString(),
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: "I changed my lucky number — it is now 99." }],
          },
          {
            role: "assistant",
            content: [{ type: "text", text: "Noted! Your lucky number is now 99." }],
          },
        ],
      }),
    });
    expect(res.ok).toBe(true);

    await poll(async () => {
      const { facts } = await search("lucky number");
      return factsContain(facts, "99");
    });

    const { facts } = await search("lucky number");
    expect(factsContain(facts, "99")).toBe(true);
  }, 90_000);

  it("manual add — storing lucky number 42 via /episodes", async () => {
    const res = await fetch(`${SERVER_URL}/episodes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "journey-manual-add",
        episode_body: "My lucky number has changed once more. It is now 42.",
        source_description: "manual memory_add",
        group_id: GROUP,
        source: "text",
        idempotency_key: "journey-manual-add-42",
        reference_time: new Date().toISOString(),
      }),
    });
    expect(res.ok).toBe(true);

    await poll(async () => {
      const { facts } = await search("lucky number");
      return factsContain(facts, "42");
    });

    const { facts } = await search("lucky number");
    expect(factsContain(facts, "42")).toBe(true);
  }, 90_000);

  it("manual search — 42 is current; earlier values are superseded", async () => {
    const { facts } = await search("lucky number");

    // 42 should be present and current (invalid_at null)
    const current = facts.find(f => f.fact.includes("42"));
    expect(current).toBeDefined();
    expect(current!.invalid_at).toBeNull();

    // Earlier values (47, 99) should be present but marked superseded
    const superseded47 = facts.filter(f => f.fact.includes("47") && f.invalid_at !== null);
    const superseded99 = facts.filter(f => f.fact.includes("99") && f.invalid_at !== null);
    expect(superseded47.length + superseded99.length).toBeGreaterThan(0);
  }, 30_000);

  it("manual search slow mode — returns facts and entity nodes", async () => {
    const { facts, nodes } = await search("lucky number", "slow");

    expect(facts.length).toBeGreaterThan(0);
    // Slow mode uses COMBINED_HYBRID_SEARCH_CROSS_ENCODER — nodes may be present
    // if graphiti has built entity summaries; assert the shape is correct regardless
    expect(Array.isArray(nodes)).toBe(true);
  }, 30_000);
});
