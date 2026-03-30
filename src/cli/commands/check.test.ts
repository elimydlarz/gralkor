import { describe, it, expect, vi, beforeEach } from "vitest";
import { check } from "./check.js";
import * as oc from "../lib/openclaw.js";

vi.mock("../lib/openclaw.js");

// Mock fetch globally
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// Mock child_process for uv check
vi.mock("node:child_process", () => ({
  execFile: vi.fn((_cmd: string, _args: string[], cb: Function) => {
    cb(null, { stdout: "uv 0.6.0", stderr: "" });
  }),
}));

const mocked = vi.mocked(oc);

const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  vi.resetAllMocks();
  logSpy.mockClear();
  errorSpy.mockClear();
  process.exitCode = undefined;
  mocked.checkOpenclaw.mockResolvedValue("openclaw 2026.3.0");
  mocked.getInstalledPlugins.mockResolvedValue([
    { id: "gralkor", version: "19.0.4", enabled: true },
  ]);
  mocked.getPluginInfo.mockResolvedValue({
    id: "gralkor",
    version: "19.0.4",
    enabled: true,
  });
  mocked.getConfig.mockResolvedValue(null);
  fetchMock.mockRejectedValue(new Error("not running"));
});

describe("check", () => {
  it("reads LLM provider from OpenClaw config instead of using hardcoded default", async () => {
    // Simulate user having configured openai as LLM provider
    mocked.getConfig.mockImplementation(async (key: string) => {
      if (key === "plugins.entries.gralkor.config.llm.provider") return "openai";
      if (key === "plugins.slots.memory") return "gralkor";
      return null;
    });
    process.env.OPENAI_API_KEY = "test-key";

    await check();

    // Should have checked for OPENAI_API_KEY, not GOOGLE_API_KEY
    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("openai");
    expect(output).toContain("OPENAI_API_KEY");

    delete process.env.OPENAI_API_KEY;
  });

  it("reads embedder provider from OpenClaw config", async () => {
    mocked.getConfig.mockImplementation(async (key: string) => {
      if (key === "plugins.entries.gralkor.config.embedder.provider") return "openai";
      if (key === "plugins.slots.memory") return "gralkor";
      return null;
    });
    process.env.GOOGLE_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";

    await check();

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    // Should show embedder as openai
    expect(output).toContain("Embedder provider");

    delete process.env.GOOGLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
  });

  it("falls back to default gemini when config read fails", async () => {
    mocked.getConfig.mockImplementation(async (key: string) => {
      if (key === "plugins.slots.memory") return "gralkor";
      throw new Error("config read failed");
    });
    process.env.GOOGLE_API_KEY = "test-key";

    await check();

    const output = logSpy.mock.calls.map((c) => c[0]).join("\n");
    expect(output).toContain("gemini");

    delete process.env.GOOGLE_API_KEY;
  });
});
