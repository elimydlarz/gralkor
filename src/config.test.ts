import { describe, it, expect } from "vitest";
import {
  resolveConfig,
  resolveGroupId,
  defaultConfig,
  GRAPHITI_URL,
  GRAPHITI_PORT,
  DEFAULT_LLM_PROVIDER,
  DEFAULT_LLM_MODEL,
  DEFAULT_EMBEDDER_PROVIDER,
  DEFAULT_EMBEDDER_MODEL,
  createReadyGate,
  resetReadyGate,
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

  it("defaults test to false", () => {
    const config = resolveConfig({});
    expect(config.test).toBe(false);
  });

  it("passes through test when true", () => {
    const config = resolveConfig({ test: true });
    expect(config.test).toBe(true);
  });
});

describe("defaultConfig", () => {
  it("has autoCapture enabled by default", () => {
    expect(defaultConfig.autoCapture.enabled).toBe(true);
  });

  it("has idleTimeoutMs of 5 minutes", () => {
    expect(defaultConfig.idleTimeoutMs).toBe(300_000);
  });

  it("has autoRecall enabled by default", () => {
    expect(defaultConfig.autoRecall.enabled).toBe(true);
  });

  it("has autoRecall maxResults of 10", () => {
    expect(defaultConfig.autoRecall.maxResults).toBe(10);
  });
});

describe("provider defaults", () => {
  it("DEFAULT_LLM_PROVIDER is gemini", () => {
    expect(DEFAULT_LLM_PROVIDER).toBe("gemini");
  });

  it("DEFAULT_LLM_MODEL is gemini-3-flash-preview", () => {
    expect(DEFAULT_LLM_MODEL).toBe("gemini-3-flash-preview");
  });

  it("DEFAULT_EMBEDDER_PROVIDER is gemini", () => {
    expect(DEFAULT_EMBEDDER_PROVIDER).toBe("gemini");
  });

  it("DEFAULT_EMBEDDER_MODEL is gemini-embedding-2-preview", () => {
    expect(DEFAULT_EMBEDDER_MODEL).toBe("gemini-embedding-2-preview");
  });
});

describe("ReadyGate", () => {
  it("starts not ready", () => {
    resetReadyGate();
    const gate = createReadyGate();
    expect(gate.isReady()).toBe(false);
  });

  it("becomes ready after resolve()", () => {
    resetReadyGate();
    const gate = createReadyGate();
    gate.resolve();
    expect(gate.isReady()).toBe(true);
  });

  it("resetReadyGate() resets back to not ready", () => {
    resetReadyGate();
    const gate = createReadyGate();
    gate.resolve();
    expect(gate.isReady()).toBe(true);
    resetReadyGate();
    expect(gate.isReady()).toBe(false);
  });

  it("shares state across multiple createReadyGate() calls", () => {
    resetReadyGate();
    const gate1 = createReadyGate();
    const gate2 = createReadyGate();
    gate1.resolve();
    expect(gate2.isReady()).toBe(true);
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
