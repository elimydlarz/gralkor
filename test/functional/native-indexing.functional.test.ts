/**
 * Functional test: native memory indexing.
 *
 * Assumes:
 * - OpenClaw gateway is already running (started by test/harness/run.sh)
 * - Workspace files were seeded by run.sh BEFORE gateway start
 * - Gralkor server is healthy at http://127.0.0.1:8001
 *
 * Synchronisation: polls until MEMORY.md contains GRALKOR_MARKER, which
 * proves the full path completed: gateway load → plugin register →
 * serverReady → runNativeIndexer → file written.
 *
 * Run inside the Docker harness only (pnpm run test:functional).
 */
import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { GRALKOR_MARKER } from "../../src/native-indexer.js";

const WORKSPACE = join(homedir(), ".openclaw", "workspace");
const SERVER_URL = "http://127.0.0.1:8001";

async function poll(fn: () => boolean, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error("Timed out waiting for condition");
}

beforeAll(async () => {
  // Wait until MEMORY.md contains the marker — confirms indexer ran to completion
  const memoryFile = join(WORKSPACE, "MEMORY.md");
  await poll(() => existsSync(memoryFile) && readFileSync(memoryFile, "utf8").includes(GRALKOR_MARKER));
});

describe("native memory indexing", () => {
  it("indexes MEMORY.md content into the default graph group", async () => {
    const res = await fetch(`${SERVER_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "favourite number", group_ids: ["default"], num_results: 5 }),
    });
    expect(res.ok).toBe(true);
    const { facts } = await res.json() as { facts: { fact: string }[] };
    const allFacts = facts.map(f => f.fact).join(" ");
    expect(allFacts).toContain("23");
  });

  it("indexes session memory files into the default graph group", async () => {
    const res = await fetch(`${SERVER_URL}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Python JavaScript scripting", group_ids: ["default"], num_results: 5 }),
    });
    expect(res.ok).toBe(true);
    const { facts } = await res.json() as { facts: { fact: string }[] };
    const allFacts = facts.map(f => f.fact).join(" ");
    expect(allFacts).toMatch(/python|javascript/i);
  });
});
