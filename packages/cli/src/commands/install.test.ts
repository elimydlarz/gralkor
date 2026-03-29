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
});

describe("install", () => {
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

  it("migrates from memory-gralkor", async () => {
    mocked.getInstalledPlugins.mockResolvedValue([
      { id: "memory-gralkor", version: "18.0.0", enabled: true },
    ]);

    await install({ source: "@susu-eng/gralkor" });

    expect(mocked.uninstallPlugin).toHaveBeenCalledWith("memory-gralkor");
    expect(mocked.installPlugin).toHaveBeenCalledWith("@susu-eng/gralkor");
  });

  it("refuses downgrade", async () => {
    mocked.getInstalledPlugins.mockResolvedValue([
      { id: "gralkor", version: "20.0.0", enabled: true },
    ]);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.installPlugin).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("errors when tarball file not found", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    await install({ source: "/data/susu-eng-gralkor-memory-19.0.4.tgz" });

    expect(mocked.installPlugin).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("dry run prints actions without executing", async () => {
    await install({ source: "@susu-eng/gralkor", dryRun: true });

    expect(mocked.installPlugin).not.toHaveBeenCalled();
    expect(mocked.enablePlugin).not.toHaveBeenCalled();
    expect(mocked.setConfig).not.toHaveBeenCalled();
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
