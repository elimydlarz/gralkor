import { describe, it, expect, vi, beforeEach } from "vitest";
import { install } from "./install.js";
import * as oc from "../lib/openclaw.js";
import * as fs from "node:fs";

vi.mock("../lib/openclaw.js");
vi.mock("node:fs", () => ({ existsSync: vi.fn(() => true) }));

const mocked = vi.mocked(oc);

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fs.existsSync).mockReturnValue(true);
  process.exitCode = undefined;
  mocked.checkOpenclaw.mockResolvedValue("openclaw 2026.3.0");
  // First call: no plugins installed. Second call (post-install verification): gralkor present.
  mocked.getInstalledPlugins
    .mockResolvedValueOnce([])
    .mockResolvedValue([{ id: "gralkor", version: "26.0.0", enabled: true }]);
  mocked.installPlugin.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
  mocked.uninstallPlugin.mockResolvedValue(undefined);
  mocked.setConfig.mockResolvedValue(undefined);
});

describe("install", () => {
  it("defaults to @susu-eng/gralkor@latest when no source override", async () => {
    await install({ source: "@susu-eng/gralkor@latest" });

    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor@latest");
  });

  it("fresh install from npm ref", async () => {
    await install({ source: "@susu-eng/gralkor" });

    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor");
    // Must NOT set memory slot — operator's responsibility
    const slotCalls = mocked.setConfig.mock.calls.filter(
      ([key]) => key === "plugins.slots.memory"
    );
    expect(slotCalls).toEqual([]);
  });

  it("skips install when same version already installed", async () => {
    mocked.getInstalledPlugins.mockReset();
    mocked.getInstalledPlugins.mockResolvedValue([
      { id: "gralkor", version: "19.0.4", enabled: true },
    ]);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.installPlugin).not.toHaveBeenCalled();
  });

  it("upgrades when older version installed", async () => {
    mocked.getInstalledPlugins.mockReset();
    mocked.getInstalledPlugins
      .mockResolvedValueOnce([{ id: "gralkor", version: "19.0.3", enabled: true }])
      .mockResolvedValue([{ id: "gralkor", version: "19.0.4", enabled: true }]);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.uninstallPlugin).toHaveBeenCalledWith("gralkor");
    expect(mocked.installPlugin).toHaveBeenCalled();
  });

  it("proceeds with fresh install when plugins list fails", async () => {
    mocked.getInstalledPlugins.mockRejectedValue(new Error("Config invalid"));

    await install({ source: "@susu-eng/gralkor" });

    // Should still install despite listing failure
    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor");
  });

  it("errors when tarball file not found", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.installPlugin).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("applies --config JSON", async () => {
    await install({
      source: "@susu-eng/gralkor",
      config: '{"llm":{"model":"gpt-4.1-mini"}}',
    });

    expect(mocked.setConfig).toHaveBeenCalledWith(
      "plugins.entries.gralkor.config.llm.model",
      "gpt-4.1-mini"
    );
  });

  it("applies --set key=value", async () => {
    await install({
      source: "@susu-eng/gralkor",
      set: ["test=true"],
    });

    expect(mocked.setConfig).toHaveBeenCalledWith(
      "plugins.entries.gralkor.config.test",
      "true"
    );
  });
});
