import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(new URL("../scripts/bundle-server.mjs", import.meta.url));

async function runBundleServer(src: string, dest: string) {
  return execFileAsync("node", [scriptPath], {
    env: { ...process.env, BUNDLE_SERVER_SRC: src, BUNDLE_SERVER_DEST: dest },
  });
}

describe("bundle-server.mjs", () => {
  let workDir: string;
  let src: string;
  let dest: string;

  beforeEach(() => {
    workDir = mkdtempSync(join(tmpdir(), "bundle-server-test-"));
    src = join(workDir, "server");
    dest = join(workDir, "out");
  });

  it("copies the source tree into the destination", async () => {
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "main.py"), "print('hi')");
    mkdirSync(join(src, "pipelines"));
    writeFileSync(join(src, "pipelines", "interpret.py"), "x = 1");

    await runBundleServer(src, dest);

    expect(readFileSync(join(dest, "main.py"), "utf-8")).toBe("print('hi')");
    expect(readFileSync(join(dest, "pipelines", "interpret.py"), "utf-8")).toBe("x = 1");
    rmSync(workDir, { recursive: true, force: true });
  });

  it("wipes the destination before copying so stale files are removed", async () => {
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "new.py"), "new");
    mkdirSync(dest, { recursive: true });
    writeFileSync(join(dest, "stale.py"), "stale");

    await runBundleServer(src, dest);

    expect(existsSync(join(dest, "new.py"))).toBe(true);
    expect(existsSync(join(dest, "stale.py"))).toBe(false);
    rmSync(workDir, { recursive: true, force: true });
  });

  it.each([".venv", ".pytest_cache", "__pycache__", "wheels", "tests", "mutants", "tmp"])(
    "skips the %s directory",
    async (skipDir) => {
      mkdirSync(src, { recursive: true });
      writeFileSync(join(src, "keep.py"), "keep");
      mkdirSync(join(src, skipDir));
      writeFileSync(join(src, skipDir, "drop.txt"), "drop");

      await runBundleServer(src, dest);

      expect(existsSync(join(dest, "keep.py"))).toBe(true);
      expect(existsSync(join(dest, skipDir))).toBe(false);
      rmSync(workDir, { recursive: true, force: true });
    },
  );

  it("skips .pyc files", async () => {
    mkdirSync(src, { recursive: true });
    writeFileSync(join(src, "keep.py"), "keep");
    writeFileSync(join(src, "drop.pyc"), "bytes");

    await runBundleServer(src, dest);

    expect(existsSync(join(dest, "keep.py"))).toBe(true);
    expect(existsSync(join(dest, "drop.pyc"))).toBe(false);
    rmSync(workDir, { recursive: true, force: true });
  });

  it("exits non-zero when the source does not exist", async () => {
    const missing = join(workDir, "does-not-exist");
    await expect(runBundleServer(missing, dest)).rejects.toMatchObject({ code: 1 });
    rmSync(workDir, { recursive: true, force: true });
  });
});
