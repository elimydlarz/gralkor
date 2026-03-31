import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "../..");

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("publish-version-integrity", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gralkor-publish-"));

    // Copy the three version files and the publish script
    for (const f of [
      "package.json",
      "openclaw.plugin.json",
      "resources/memory/package.json",
    ]) {
      const dest = join(tempDir, f);
      execSync(`mkdir -p "${join(tempDir, f, "..")}"`, { stdio: "ignore" });
      cpSync(join(PROJECT_ROOT, f), dest);
    }
    cpSync(
      join(PROJECT_ROOT, "scripts/publish.sh"),
      join(tempDir, "scripts/publish.sh"),
      { recursive: true },
    );

    // Init a git repo so `npm version` works and git operations can be tested
    execSync("git init && git add -A && git commit -m init --no-gpg-sign", {
      cwd: tempDir,
      stdio: "ignore",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "test",
        GIT_AUTHOR_EMAIL: "test@test",
        GIT_COMMITTER_NAME: "test",
        GIT_COMMITTER_EMAIL: "test@test",
      },
    });
  });

  afterEach(() => {
    execSync(`rm -rf "${tempDir}"`);
  });

  describe("when DRY_RUN is set", () => {
    it("then version is bumped and synced across manifests", () => {
      const before = readJson(join(tempDir, "package.json")).version as string;

      execSync("bash scripts/publish.sh patch", {
        cwd: tempDir,
        env: { ...process.env, DRY_RUN: "1" },
        stdio: "ignore",
      });

      const pkgVersion = readJson(join(tempDir, "package.json"))
        .version as string;
      const pluginVersion = readJson(join(tempDir, "openclaw.plugin.json"))
        .version as string;
      const resVersion = readJson(
        join(tempDir, "resources/memory/package.json"),
      ).version as string;

      expect(pkgVersion).not.toBe(before);
      expect(pluginVersion).toBe(pkgVersion);
      expect(resVersion).toBe(pkgVersion);
    });

    it("and build and publish are skipped", () => {
      // DRY_RUN should not fail even without a build command available
      // (no pnpm in temp dir). If build ran, it would fail.
      expect(() =>
        execSync("bash scripts/publish.sh patch", {
          cwd: tempDir,
          env: { ...process.env, DRY_RUN: "1" },
          stdio: "ignore",
        }),
      ).not.toThrow();
    });

    it("and no git commit or tag is created", () => {
      execSync("bash scripts/publish.sh patch", {
        cwd: tempDir,
        env: { ...process.env, DRY_RUN: "1" },
        stdio: "ignore",
      });

      const log = execSync("git log --oneline", {
        cwd: tempDir,
        encoding: "utf8",
      });
      // Only the init commit
      expect(log.trim().split("\n")).toHaveLength(1);

      const tags = execSync("git tag", {
        cwd: tempDir,
        encoding: "utf8",
      });
      expect(tags.trim()).toBe("");
    });
  });
});
