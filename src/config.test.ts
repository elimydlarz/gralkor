import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  resolveGroupId,
  defaultConfig,
  GRAPHITI_URL,
  GRAPHITI_PORT,
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

  it("exports GRAPHITI_URL constant", () => {
    expect(GRAPHITI_URL).toBe("http://graphiti:8001");
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
