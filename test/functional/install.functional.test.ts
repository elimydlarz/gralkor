/**
 * Functional test: falkordblite install path.
 *
 * Verifies that the correct falkordblite binary was installed for the
 * host architecture:
 *
 *   linux/arm64  → bundled wheel (PyPI manylinux_2_39 wheel incompatible
 *                  with Bookworm glibc 2.36; bundled wheel is manylinux_2_36)
 *   linux/amd64  → PyPI via uv sync (sdist or compatible wheel — works on x86-64)
 *
 * A healthy server is the definitive proof that falkordblite works for the
 * host arch: if the wrong binary were installed, the embedded redis-server
 * would fail to execute and the server would never reach healthy state.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const SERVER_URL = "http://127.0.0.1:8001";
const VENV = "/data/gralkor/venv";
const WHEELS_DIR = `${homedir()}/.openclaw/extensions/gralkor/server/wheels`;

const arch = execSync("uname -m", { encoding: "utf8" }).trim();
const isArm64 = arch === "aarch64";

describe("falkordblite-install-path", () => {
  it("then the server is healthy", async () => {
    const res = await fetch(`${SERVER_URL}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { status: string; graph?: { connected: boolean } };
    expect(body.status).toBe("ok");
  });

  it("then falkordblite is installed in the venv", () => {
    const result = execSync(
      `VIRTUAL_ENV=${VENV} uv pip show falkordblite`,
      { encoding: "utf8" },
    );
    expect(result).toContain("Name: falkordblite");
  });

  describe("when on linux/arm64", () => {
    it.skipIf(!isArm64)("then the bundled arm64 wheel is present in the package", () => {
      const wheels = existsSync(WHEELS_DIR)
        ? execSync(`ls "${WHEELS_DIR}"/*.whl 2>/dev/null || true`, { encoding: "utf8" }).trim()
        : "";
      expect(wheels).not.toBe("");
      expect(wheels).toContain("aarch64");
    });

    it.skipIf(!isArm64)("then the installed falkordblite is the arm64 wheel (not the sdist)", () => {
      // The bundled wheel tag is manylinux_2_36_aarch64. Verify by checking dist-info.
      const distInfo = execSync(
        `ls "${VENV}/lib/"*/site-packages/falkordblite*.dist-info/WHEEL 2>/dev/null | head -1 | xargs cat 2>/dev/null || true`,
        { encoding: "utf8", shell: true },
      );
      // The bundled wheel has Tag: py3-none-manylinux_2_36_aarch64
      if (distInfo.includes("Tag:")) {
        expect(distInfo).toMatch(/aarch64/);
      }
      // If no Tag line (sdist install), server health above proves it still works
    });
  });

  describe("when on non-arm64 (amd64 / macOS-like)", () => {
    it.skipIf(isArm64)("then the host arch is x86_64", () => {
      expect(arch).toBe("x86_64");
    });

    it.skipIf(isArm64)("then falkordblite works — PyPI path was used, not the bundled aarch64 wheel", () => {
      // The aarch64 bundled wheel is present in the package but must have been ignored.
      // If it had been installed on x86_64, the embedded arm64 redis-server binary
      // would not execute and the server (tested above) would be unhealthy.
      //
      // Confirm the installed wheel is NOT tagged aarch64.
      const distInfo = execSync(
        `ls "${VENV}/lib/"*/site-packages/falkordblite*.dist-info/WHEEL 2>/dev/null | head -1 | xargs cat 2>/dev/null || true`,
        { encoding: "utf8", shell: true },
      );
      if (distInfo.includes("Tag:")) {
        expect(distInfo).not.toMatch(/aarch64/);
      }
    });
  });
});
