import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, cpSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const PROJECT_ROOT = join(import.meta.dirname, "../..");

function readVersion(mixFile: string): string {
  const src = readFileSync(mixFile, "utf8");
  const m = src.match(/@version\s+"([^"]+)"/);
  if (!m) throw new Error("no @version in " + mixFile);
  return m[1];
}

describe("publish-ex-version-integrity", () => {
  let tempDir: string;
  let mixFile: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "gralkor-publish-ex-"));
    mkdirSync(join(tempDir, "ex"));
    mkdirSync(join(tempDir, "scripts"));
    cpSync(
      join(PROJECT_ROOT, "ex/mix.exs"),
      join(tempDir, "ex/mix.exs"),
    );
    cpSync(
      join(PROJECT_ROOT, "scripts/publish-ex.sh"),
      join(tempDir, "scripts/publish-ex.sh"),
    );
    mixFile = join(tempDir, "ex/mix.exs");

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

  describe("when publish succeeds", () => {
    it("then @version is bumped in ex/mix.exs", () => {
      const before = readVersion(mixFile);

      execSync("bash scripts/publish-ex.sh patch", {
        cwd: tempDir,
        env: {
          ...process.env,
          PUBLISH_HEX_WHOAMI_CMD: "true",
          PUBLISH_HEX_PUBLISH_CMD: "true",
          GIT_AUTHOR_NAME: "test",
          GIT_AUTHOR_EMAIL: "test@test",
          GIT_COMMITTER_NAME: "test",
          GIT_COMMITTER_EMAIL: "test@test",
        },
        stdio: "ignore",
      });

      expect(readVersion(mixFile)).not.toBe(before);
    });

    it("and a git tag ex-v${version} is created for the new version", () => {
      execSync("bash scripts/publish-ex.sh patch", {
        cwd: tempDir,
        env: {
          ...process.env,
          PUBLISH_HEX_WHOAMI_CMD: "true",
          PUBLISH_HEX_PUBLISH_CMD: "true",
          GIT_AUTHOR_NAME: "test",
          GIT_AUTHOR_EMAIL: "test@test",
          GIT_COMMITTER_NAME: "test",
          GIT_COMMITTER_EMAIL: "test@test",
        },
        stdio: "ignore",
      });

      const version = readVersion(mixFile);
      const tags = execSync("git tag", { cwd: tempDir, encoding: "utf8" });
      expect(tags.trim()).toBe(`ex-v${version}`);
    });
  });

  describe("when not logged in to Hex", () => {
    it("then exits before version bump and no rollback is needed", () => {
      const before = readVersion(mixFile);

      try {
        execSync("bash scripts/publish-ex.sh patch", {
          cwd: tempDir,
          env: { ...process.env, PUBLISH_HEX_WHOAMI_CMD: "false" },
          stdio: "ignore",
        });
      } catch {
        // expected
      }

      expect(readVersion(mixFile)).toBe(before);
      const tags = execSync("git tag", { cwd: tempDir, encoding: "utf8" });
      expect(tags.trim()).toBe("");
    });
  });

  describe("when publish fails (mix hex.publish reject)", () => {
    it("then @version in ex/mix.exs is rolled back to its pre-publish value", () => {
      const before = readVersion(mixFile);

      try {
        execSync("bash scripts/publish-ex.sh patch", {
          cwd: tempDir,
          env: {
            ...process.env,
            PUBLISH_HEX_WHOAMI_CMD: "true",
            PUBLISH_HEX_PUBLISH_CMD: "false",
          },
          stdio: "ignore",
        });
      } catch {
        // expected
      }

      expect(readVersion(mixFile)).toBe(before);
    });

    it("and no git tag is created", () => {
      try {
        execSync("bash scripts/publish-ex.sh patch", {
          cwd: tempDir,
          env: {
            ...process.env,
            PUBLISH_HEX_WHOAMI_CMD: "true",
            PUBLISH_HEX_PUBLISH_CMD: "false",
          },
          stdio: "ignore",
        });
      } catch {
        // expected
      }

      const tags = execSync("git tag", { cwd: tempDir, encoding: "utf8" });
      expect(tags.trim()).toBe("");
    });
  });

  describe("when successive publishes fail", () => {
    it("then @version does not increment multiple times", () => {
      const before = readVersion(mixFile);

      for (let i = 0; i < 3; i++) {
        try {
          execSync("bash scripts/publish-ex.sh patch", {
            cwd: tempDir,
            env: {
              ...process.env,
              PUBLISH_HEX_WHOAMI_CMD: "true",
              PUBLISH_HEX_PUBLISH_CMD: "false",
            },
            stdio: "ignore",
          });
        } catch {
          // expected
        }
      }

      expect(readVersion(mixFile)).toBe(before);
    });
  });

  describe("when DRY_RUN is set", () => {
    it("then @version is bumped in ex/mix.exs", () => {
      const before = readVersion(mixFile);

      execSync("bash scripts/publish-ex.sh patch", {
        cwd: tempDir,
        env: { ...process.env, DRY_RUN: "1" },
        stdio: "ignore",
      });

      expect(readVersion(mixFile)).not.toBe(before);
    });

    it("and publish is skipped and no git tag is created", () => {
      expect(() =>
        execSync("bash scripts/publish-ex.sh patch", {
          cwd: tempDir,
          env: { ...process.env, DRY_RUN: "1" },
          stdio: "ignore",
        }),
      ).not.toThrow();

      const tags = execSync("git tag", { cwd: tempDir, encoding: "utf8" });
      expect(tags.trim()).toBe("");
    });
  });

  describe("when level is current", () => {
    it("then @version is not incremented but a git tag is created", () => {
      const before = readVersion(mixFile);

      execSync("bash scripts/publish-ex.sh current", {
        cwd: tempDir,
        env: {
          ...process.env,
          PUBLISH_HEX_WHOAMI_CMD: "true",
          PUBLISH_HEX_PUBLISH_CMD: "true",
          GIT_AUTHOR_NAME: "test",
          GIT_AUTHOR_EMAIL: "test@test",
          GIT_COMMITTER_NAME: "test",
          GIT_COMMITTER_EMAIL: "test@test",
        },
        stdio: "ignore",
      });

      expect(readVersion(mixFile)).toBe(before);
      const tags = execSync("git tag", { cwd: tempDir, encoding: "utf8" });
      expect(tags.trim()).toBe(`ex-v${before}`);
    });

    it("when publish fails, no rollback runs and ex/mix.exs remains unchanged", () => {
      const before = readVersion(mixFile);

      try {
        execSync("bash scripts/publish-ex.sh current", {
          cwd: tempDir,
          env: {
            ...process.env,
            PUBLISH_HEX_WHOAMI_CMD: "true",
            PUBLISH_HEX_PUBLISH_CMD: "false",
          },
          stdio: "ignore",
        });
      } catch {
        // expected
      }

      expect(readVersion(mixFile)).toBe(before);
    });
  });
});
