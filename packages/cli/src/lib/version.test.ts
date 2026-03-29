import { describe, it, expect } from "vitest";
import { extractVersionFromTarball, extractVersionFromNpmRef, compareVersions, getCLIVersion } from "./version.js";

describe("extractVersionFromTarball", () => {
  it("extracts from make pack output (memory suffix)", () => {
    expect(extractVersionFromTarball("susu-eng-gralkor-memory-19.0.4.tgz")).toBe("19.0.4");
  });

  it("extracts from pnpm pack output (no suffix)", () => {
    expect(extractVersionFromTarball("susu-eng-gralkor-19.0.4.tgz")).toBe("19.0.4");
  });

  it("extracts from full path", () => {
    expect(extractVersionFromTarball("/data/susu-eng-gralkor-memory-19.0.4.tgz")).toBe("19.0.4");
  });

  it("returns null for non-matching filename", () => {
    expect(extractVersionFromTarball("some-other-package-1.0.0.tgz")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(extractVersionFromTarball("")).toBeNull();
  });
});

describe("extractVersionFromNpmRef", () => {
  it("extracts from scoped package with version", () => {
    expect(extractVersionFromNpmRef("@susu-eng/gralkor@19.0.4")).toBe("19.0.4");
  });

  it("returns null for package without version", () => {
    expect(extractVersionFromNpmRef("@susu-eng/gralkor")).toBeNull();
  });

  it("returns null for latest tag", () => {
    expect(extractVersionFromNpmRef("@susu-eng/gralkor@latest")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("returns 0 for equal versions", () => {
    expect(compareVersions("19.0.4", "19.0.4")).toBe(0);
  });

  it("returns -1 when a < b (patch)", () => {
    expect(compareVersions("19.0.3", "19.0.4")).toBe(-1);
  });

  it("returns 1 when a > b (patch)", () => {
    expect(compareVersions("19.0.5", "19.0.4")).toBe(1);
  });

  it("returns -1 when a < b (minor)", () => {
    expect(compareVersions("19.0.4", "19.1.0")).toBe(-1);
  });

  it("returns -1 when a < b (major)", () => {
    expect(compareVersions("18.9.9", "19.0.0")).toBe(-1);
  });

  it("returns 1 when a > b (major)", () => {
    expect(compareVersions("20.0.0", "19.9.9")).toBe(1);
  });
});

describe("getCLIVersion", () => {
  it("returns version from package.json (not hardcoded)", () => {
    const version = getCLIVersion();
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("matches package.json version", async () => {
    const { readFile } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(await readFile(join(__dirname, "..", "..", "package.json"), "utf-8"));
    expect(getCLIVersion()).toBe(pkg.version);
  });
});
