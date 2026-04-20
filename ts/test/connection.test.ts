import { describe, it, expect } from "vitest";
import { GralkorInMemoryClient } from "../src/client/in-memory.js";
import { waitForHealth } from "../src/connection.js";

describe("waitForHealth", () => {
  describe("when starting up", () => {
    it("resolves when healthCheck reports ok, no more polling after", async () => {
      const client = new GralkorInMemoryClient();
      client.setResponse("healthCheck", { ok: true });

      await waitForHealth(client, { timeoutMs: 200, backoffMs: 10 });

      const countAtReady = client.healthChecks.length;
      await new Promise((r) => setTimeout(r, 40));
      expect(client.healthChecks.length).toBe(countAtReady);
    });

    it("rejects when the backend does not respond healthy within the timeout", async () => {
      const client = new GralkorInMemoryClient();
      client.setResponse("healthCheck", { error: "gralkor_down" });

      await expect(
        waitForHealth(client, { timeoutMs: 30, backoffMs: 10 }),
      ).rejects.toThrow(/gralkor_unreachable/);
    });

    it("keeps polling until a healthy response arrives", async () => {
      const client = new GralkorInMemoryClient();

      client.setResponse("healthCheck", { error: "not_ready" });
      const promise = waitForHealth(client, { timeoutMs: 200, backoffMs: 10 });

      // flip to healthy after the second poll attempt
      setTimeout(() => client.setResponse("healthCheck", { ok: true }), 25);

      await expect(promise).resolves.toBeUndefined();
      expect(client.healthChecks.length).toBeGreaterThan(1);
    });
  });
});
