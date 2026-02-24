import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  resolveGroupIds,
  defaultConfig,
  SHARED_GROUP_ID,
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

describe("resolveGroupIds()", () => {
  it("returns agentId and shared group", () => {
    const ids = resolveGroupIds({ agentId: "agent-42" });
    expect(ids.agent).toBe("agent-42");
    expect(ids.shared).toBe(SHARED_GROUP_ID);
  });

  it("falls back to 'default' when agentId is missing", () => {
    const ids = resolveGroupIds({});
    expect(ids.agent).toBe("default");
    expect(ids.shared).toBe(SHARED_GROUP_ID);
  });

  it("falls back to 'default' when agentId is undefined", () => {
    const ids = resolveGroupIds({ agentId: undefined });
    expect(ids.agent).toBe("default");
  });
});

describe("SHARED_GROUP_ID", () => {
  it("is 'agent-family'", () => {
    expect(SHARED_GROUP_ID).toBe("agent-family");
  });
});
