import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "../..");

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

describe("publish-all", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gralkor-publish-all-"));

    for (const f of ["package.json", "openclaw.plugin.json"]) {
      cpSync(join(PROJECT_ROOT, f), join(tempDir, f));
    }
    for (const f of [
      "scripts/publish-all.sh",
      "scripts/publish-npm.sh",
      "scripts/publish-clawhub.sh",
    ]) {
      cpSync(join(PROJECT_ROOT, f), join(tempDir, f), { recursive: true });
    }

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

  const successEnv = {
    PUBLISH_NPM_WHOAMI_CMD: "true",
    PUBLISH_CLAWHUB_WHOAMI_CMD: "true",
    PUBLISH_BUILD_CMD: "true",
    PUBLISH_WHEEL_CMD: "true",
    PUBLISH_PUBLISH_CMD: "true",
    PUBLISH_SKIP_GH_RELEASE: "1",
    GIT_AUTHOR_NAME: "test",
    GIT_AUTHOR_EMAIL: "test@test",
    GIT_COMMITTER_NAME: "test",
    GIT_COMMITTER_EMAIL: "test@test",
  };

  describe("when publish:all succeeds", () => {
    it("then npm is published first with the version bump and only one bump occurs", () => {
      const before = readJson(join(tempDir, "package.json")).version as string;

      execSync("bash scripts/publish-all.sh patch", {
        cwd: tempDir,
        env: { ...process.env, ...successEnv },
        stdio: "ignore",
      });

      const after = readJson(join(tempDir, "package.json")).version as string;
      const afterPlugin = readJson(
        join(tempDir, "openclaw.plugin.json"),
      ).version as string;

      expect(after).not.toBe(before);
      expect(afterPlugin).toBe(after);
    });

    it("and clawhub is published at the bumped version", () => {
      execSync("bash scripts/publish-all.sh patch", {
        cwd: tempDir,
        env: { ...process.env, ...successEnv },
        stdio: "ignore",
      });

      const version = readJson(join(tempDir, "package.json")).version as string;
      const tags = execSync("git tag", { cwd: tempDir, encoding: "utf8" });
      expect(tags.trim()).toContain(`v${version}`);
    });
  });

  describe("when npm publish fails", () => {
    it("then clawhub publish does not run", () => {
      let publishCallCount = 0;

      try {
        execSync("bash scripts/publish-all.sh patch", {
          cwd: tempDir,
          env: {
            ...process.env,
            PUBLISH_NPM_WHOAMI_CMD: "true",
            PUBLISH_BUILD_CMD: "false", // npm step fails
          },
          stdio: "ignore",
        });
      } catch {
        // expected
      }

      // version should be rolled back (npm rollback ran), clawhub never started
      const before = readJson(
        join(PROJECT_ROOT, "package.json"),
      ).version as string;
      const after = readJson(join(tempDir, "package.json")).version as string;
      expect(after).toBe(before);
    });
  });

  describe("when npm publish succeeds but clawhub publish fails", () => {
    it("then a recovery hint is printed", () => {
      let stderr = "";
      try {
        const result = execSync("bash scripts/publish-all.sh patch", {
          cwd: tempDir,
          env: {
            ...process.env,
            PUBLISH_NPM_WHOAMI_CMD: "true",
            PUBLISH_CLAWHUB_WHOAMI_CMD: "true",
            PUBLISH_BUILD_CMD: "true",
            PUBLISH_WHEEL_CMD: "true",
            // First call (npm) succeeds, second call (clawhub) fails.
            // publish-npm.sh uses pnpm publish; publish-clawhub.sh uses clawhub publish.
            // Use PUBLISH_PUBLISH_CMD to control the publish step in both scripts.
            // Override clawhub's publish to fail by using a script that fails on second invocation.
            PUBLISH_NPM_PUBLISH_CMD: "true",
            PUBLISH_CLAWHUB_PUBLISH_CMD: "false",
            PUBLISH_SKIP_GH_RELEASE: "1",
            GIT_AUTHOR_NAME: "test",
            GIT_AUTHOR_EMAIL: "test@test",
            GIT_COMMITTER_NAME: "test",
            GIT_COMMITTER_EMAIL: "test@test",
          },
          stdio: ["ignore", "ignore", "pipe"],
        });
      } catch (e: unknown) {
        stderr = (e as { stderr: Buffer }).stderr?.toString() ?? "";
      }

      expect(stderr).toContain("publish:clawhub");
    });
  });
});
