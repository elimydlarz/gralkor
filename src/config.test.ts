import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  resolveConfig,
  resolveGroupId,
  probeGraphitiUrl,
  defaultConfig,
} from "./config.js";

describe("resolveConfig()", () => {
  it("returns defaults when called with no arguments", () => {
    const config = resolveConfig();
    expect(config).toEqual(defaultConfig);
  });

  it("returns defaults when called with empty object", () => {
    const config = resolveConfig({});
    expect(config).toEqual(defaultConfig);
  });

  it("overrides graphitiUrl", () => {
    const config = resolveConfig({ graphitiUrl: "http://custom:9000" });
    expect(config.graphitiUrl).toBe("http://custom:9000");
    expect(config.autoCapture).toEqual(defaultConfig.autoCapture);
    expect(config.autoRecall).toEqual(defaultConfig.autoRecall);
  });

  it("overrides autoCapture.enabled", () => {
    const config = resolveConfig({ autoCapture: { enabled: false } });
    expect(config.autoCapture.enabled).toBe(false);
  });

  it("overrides autoRecall fields independently", () => {
    const config = resolveConfig({ autoRecall: { enabled: false, maxResults: 20 } });
    expect(config.autoRecall.enabled).toBe(false);
    expect(config.autoRecall.maxResults).toBe(20);
  });

  it("uses default maxResults when only enabled is overridden", () => {
    const config = resolveConfig({ autoRecall: { enabled: true } as any });
    expect(config.autoRecall.maxResults).toBe(5);
  });
});

describe("resolveGroupId()", () => {
  it("returns agentId when provided", () => {
    expect(resolveGroupId({ agentId: "agent-42" })).toBe("agent-42");
  });

  it("falls back to 'default' when agentId is missing", () => {
    expect(resolveGroupId({})).toBe("default");
  });

  it("falls back to 'default' when agentId is undefined", () => {
    expect(resolveGroupId({ agentId: undefined })).toBe("default");
  });
});

describe("probeGraphitiUrl()", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns the first reachable URL in preference order", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("graphiti:8000")) return new Response("", { status: 200 });
      if (url.includes("localhost:8001")) return new Response("", { status: 200 });
      throw new Error("unreachable");
    });

    const result = await probeGraphitiUrl();
    expect(result).toBe("http://graphiti:8000");
  });

  it("falls back to second candidate when first is unreachable", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("localhost:8001")) return new Response("", { status: 200 });
      throw new Error("unreachable");
    });

    const result = await probeGraphitiUrl();
    expect(result).toBe("http://localhost:8001");
  });

  it("returns null when no candidates are reachable", async () => {
    fetchSpy.mockRejectedValue(new Error("unreachable"));

    const result = await probeGraphitiUrl();
    expect(result).toBeNull();
  });

  it("skips candidates that return non-ok status", async () => {
    fetchSpy.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("graphiti:8000")) return new Response("", { status: 503 });
      if (url.includes("localhost:8001")) return new Response("", { status: 200 });
      throw new Error("unreachable");
    });

    const result = await probeGraphitiUrl();
    expect(result).toBe("http://localhost:8001");
  });

  it("accepts custom candidate list", async () => {
    fetchSpy.mockResolvedValue(new Response("", { status: 200 }));

    const result = await probeGraphitiUrl(["http://custom:9000"]);
    expect(result).toBe("http://custom:9000");
  });
});
