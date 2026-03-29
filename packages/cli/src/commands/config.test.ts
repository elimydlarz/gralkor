import { describe, it, expect, vi, beforeEach } from "vitest";
import { config } from "./config.js";
import * as oc from "../lib/openclaw.js";

vi.mock("../lib/openclaw.js");

const mocked = vi.mocked(oc);

beforeEach(() => {
  vi.resetAllMocks();
  process.exitCode = undefined;
  mocked.checkOpenclaw.mockResolvedValue("openclaw 2026.3.0");
  mocked.setConfig.mockResolvedValue(undefined);
});

describe("config", () => {
  it("sets config from --config JSON", async () => {
    await config({ config: '{"llm":{"model":"gpt-4.1-mini","provider":"openai"}}' });

    expect(mocked.setConfig).toHaveBeenCalledWith(
      "plugins.entries.gralkor.config.llm.model",
      "gpt-4.1-mini",
    );
    expect(mocked.setConfig).toHaveBeenCalledWith(
      "plugins.entries.gralkor.config.llm.provider",
      "openai",
    );
  });

  it("sets config from --set key=value", async () => {
    await config({ set: ["test=true", "llm.model=gemini-3-flash-preview"] });

    expect(mocked.setConfig).toHaveBeenCalledWith(
      "plugins.entries.gralkor.config.test",
      "true",
    );
    expect(mocked.setConfig).toHaveBeenCalledWith(
      "plugins.entries.gralkor.config.llm.model",
      "gemini-3-flash-preview",
    );
  });

  it("errors when nothing to set", async () => {
    await config({});

    expect(mocked.setConfig).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });
});
