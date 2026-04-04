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

const SERVER_URL = "http://127.0.0.1:8001";
const GROUP = "default";

interface Fact {
  uuid: string;
  fact: string;
  invalid_at: string | null;
  [key: string]: unknown;
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

async function poll(condition: string, fn: () => Promise<boolean>, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(r => setTimeout(r, 10_000));
  }
  throw new Error(`Timed out waiting for: ${condition}`);
}

beforeAll(async () => {
  // Give native indexer time to process both workspace files before polling competes for Gemini quota.
  // MEMORY.md takes ~10s, session-001.md takes ~10s — poll only after both should be done.
  await new Promise(r => setTimeout(r, 20_000));

  // 1. Wait for native indexing to complete (lucky number 47 from session-001.md)
  await poll("lucky number 47 indexed from workspace file", async () => {
    const { facts } = await search("lucky number");
    return facts.some(f => f.fact.includes("47"));
  }, 90_000);

  // 2. Capture: ingest a conversation that updates lucky number to 99
  await fetch(`${SERVER_URL}/ingest-messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "journey-capture",
      source_description: "functional test capture",
      group_id: GROUP,
      idempotency_key: "journey-capture-99",
      reference_time: new Date().toISOString(),
      messages: [
        { role: "user", content: [{ type: "text", text: "Eli's lucky number changed from LuckyNumber47 to LuckyNumber99." }] },
        { role: "assistant", content: [{ type: "text", text: "Noted. Eli's lucky number is now LuckyNumber99." }] },
      ],
    }),
  });
  await poll("lucky number 99 searchable after capture ingest", async () => {
    const { facts } = await search("lucky number");
    return facts.some(f => f.fact.includes("99"));
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
    const { facts } = await search("lucky number");
    return facts.some(f => f.fact.includes("42"));
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
