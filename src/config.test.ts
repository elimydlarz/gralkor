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
    expect(config).toMatchObject(defaultConfig);
    expect(config.test).toBe(false);
  });

  it("returns defaults when called with empty object", () => {
    const config = resolveConfig({});
    expect(config).toMatchObject(defaultConfig);
    expect(config.test).toBe(false);
  });

  it("exports GRAPHITI_URL constant pointing to localhost", () => {
    expect(GRAPHITI_URL).toBe("http://127.0.0.1:8001");
  });

  it("exports GRAPHITI_PORT constant", () => {
    expect(GRAPHITI_PORT).toBe(8001);
  });

  it("passes through dataDir when provided", () => {
    const config = resolveConfig({ dataDir: "/custom/data" });
    expect(config.dataDir).toBe("/custom/data");
  });

  it("defaults dataDir to undefined when not provided", () => {
    const config = resolveConfig({});
    expect(config.dataDir).toBeUndefined();
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
    expect(config.autoRecall.maxResults).toBe(10);
  });

  it("passes through llm config when provided", () => {
    const config = resolveConfig({ llm: { provider: "gemini", model: "gemini-2.0-flash" } });
    expect(config.llm).toEqual({ provider: "gemini", model: "gemini-2.0-flash" });
  });

  it("passes through embedder config when provided", () => {
    const config = resolveConfig({ embedder: { provider: "openai", model: "text-embedding-3-small" } });
    expect(config.embedder).toEqual({ provider: "openai", model: "text-embedding-3-small" });
  });

  it("defaults llm and embedder to undefined when not provided", () => {
    const config = resolveConfig({});
    expect(config.llm).toBeUndefined();
    expect(config.embedder).toBeUndefined();
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
