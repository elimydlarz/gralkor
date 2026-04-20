import type { GralkorClient } from "./client.js";

export interface WaitForHealthOptions {
  /** Total time (ms) to wait for the backend to respond healthy. Default 120_000. */
  timeoutMs?: number;
  /** Delay (ms) between polls. Default 500. */
  backoffMs?: number;
}

/**
 * Boot-readiness helper. Polls {@link GralkorClient.healthCheck} until it
 * resolves `{ ok: true }` or the timeout elapses. Rejects with
 * `Error("gralkor_unreachable: <reason>")` on timeout so the caller can
 * decide whether to retry or fail.
 *
 * Idle after ready — no further polling. Runtime outages surface via
 * fail-fast on the next actual call; Gralkor's own server monitor handles
 * restart. Don't reinvent that here; a client-side periodic poll races
 * uvicorn's HTTP keep-alive and produces spurious up→down transitions.
 */
export async function waitForHealth(
  client: GralkorClient,
  opts: WaitForHealthOptions = {},
): Promise<void> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const backoffMs = opts.backoffMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  let lastError: unknown = "no response";

  while (true) {
    const r = await client.healthCheck();
    if ("ok" in r) return;

    lastError = r.error;
    if (Date.now() + backoffMs >= deadline) {
      throw new Error(`gralkor_unreachable: ${JSON.stringify(lastError)}`);
    }
    await sleep(backoffMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
