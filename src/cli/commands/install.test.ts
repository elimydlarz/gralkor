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
  mocked.getInstalledPlugins.mockResolvedValue([]);
  mocked.installPlugin.mockResolvedValue(undefined);
  mocked.uninstallPlugin.mockResolvedValue(undefined);
  mocked.enablePlugin.mockResolvedValue(undefined);
  mocked.setConfig.mockResolvedValue(undefined);
  mocked.removePluginDir.mockResolvedValue(undefined);
});

describe("install", () => {
  it("defaults to @susu-eng/gralkor@latest when no source override", async () => {
    await install({ source: "@susu-eng/gralkor@latest" });

    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor@latest");
  });

  it("fresh install from npm ref", async () => {
    await install({ source: "@susu-eng/gralkor" });

    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor");
    expect(mocked.enablePlugin).toHaveBeenCalledWith("gralkor");
    expect(mocked.setConfig).toHaveBeenCalledWith("plugins.slots.memory", "gralkor");
  });

  it("skips install when same version already installed", async () => {
    mocked.getInstalledPlugins.mockResolvedValue([
      { id: "gralkor", version: "19.0.4", enabled: true },
    ]);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.installPlugin).not.toHaveBeenCalled();
    expect(mocked.enablePlugin).toHaveBeenCalledWith("gralkor");
  });

  it("upgrades when older version installed", async () => {
    mocked.getInstalledPlugins.mockResolvedValue([
      { id: "gralkor", version: "19.0.3", enabled: true },
    ]);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.uninstallPlugin).toHaveBeenCalledWith("gralkor");
    expect(mocked.installPlugin).toHaveBeenCalled();
  });

  it("cleans up stale install when plugin not in list", async () => {
    // Plugin directory exists on disk but openclaw plugins list doesn't report it
    mocked.getInstalledPlugins.mockResolvedValue([]);
    mocked.uninstallPlugin.mockRejectedValue(new Error("not installed"));
    mocked.deleteConfig.mockResolvedValue(undefined);

    await install({ source: "@susu-eng/gralkor" });

    // Should attempt uninstall (swallowing the error), remove dir, clean config, then install
    expect(mocked.uninstallPlugin).toHaveBeenCalledWith("gralkor");
    expect(mocked.removePluginDir).toHaveBeenCalledWith("gralkor");
    expect(mocked.deleteConfig).toHaveBeenCalledWith("plugins.entries.gralkor");
    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor");
  });

  it("proactively clears stale memory slot before listing plugins", async () => {
    await install({ source: "@susu-eng/gralkor" });

    // setConfig("plugins.slots.memory", "") should be called first (proactive clear)
    // then again with "gralkor" after install
    const slotCalls = mocked.setConfig.mock.calls.filter(
      ([key]) => key === "plugins.slots.memory"
    );
    expect(slotCalls[0]).toEqual(["plugins.slots.memory", ""]);
    expect(slotCalls[slotCalls.length - 1]).toEqual(["plugins.slots.memory", "gralkor"]);
  });

  it("proceeds with fresh install when plugins list fails after slot clear", async () => {
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
