import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ChildProcess } from "node:child_process";

// Mock child_process
vi.mock("node:child_process", () => {
  const EventEmitter = require("node:events").EventEmitter;
  return {
    execFile: vi.fn(),
    spawn: vi.fn(),
  };
});

// Mock fs
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  statSync: vi.fn(),
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { execFile, spawn } from "node:child_process";
import { existsSync, statSync, readFileSync, writeFileSync } from "node:fs";
import { findPython, ensureVenv, createServerManager } from "./server-manager.js";
import { EventEmitter } from "node:events";

// Helper: promisify mock for execFile
function mockExecFileSuccess(stdout: string) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, _args: string[], ...rest: unknown[]) => {
      // execFile with promisify calls the callback
      const cb = typeof rest[rest.length - 1] === "function"
        ? rest[rest.length - 1] as (err: Error | null, result: { stdout: string; stderr: string }) => void
        : typeof rest[rest.length - 2] === "function"
          ? rest[rest.length - 2] as (err: Error | null, result: { stdout: string; stderr: string }) => void
          : null;
      if (cb) {
        cb(null, { stdout, stderr: "" });
      }
    },
  );
}

function mockExecFileError() {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, _args: string[], ...rest: unknown[]) => {
      const cb = typeof rest[rest.length - 1] === "function"
        ? rest[rest.length - 1] as (err: Error | null) => void
        : typeof rest[rest.length - 2] === "function"
          ? rest[rest.length - 2] as (err: Error | null) => void
          : null;
      if (cb) {
        cb(new Error("command not found"));
      }
    },
  );
}

describe("findPython", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("finds python3.12 when available", async () => {
    let callCount = 0;
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, _args: string[], ...rest: unknown[]) => {
        const cb = typeof rest[rest.length - 1] === "function"
          ? rest[rest.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
          : null;
        callCount++;
        if (cmd === "python3.12" && cb) {
          cb(null, { stdout: "Python 3.12.1\n", stderr: "" });
        } else if (cb) {
          cb(new Error("not found"));
        }
      },
    );

    const result = await findPython();
    expect(result).toBe("python3.12");
  });

  it("falls back to python3 when python3.12 and python3.13 not found", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, _args: string[], ...rest: unknown[]) => {
        const cb = typeof rest[rest.length - 1] === "function"
          ? rest[rest.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
          : null;
        if (cmd === "python3" && cb) {
          cb(null, { stdout: "Python 3.13.0\n", stderr: "" });
        } else if (cb) {
          cb(new Error("not found"));
        }
      },
    );

    const result = await findPython();
    expect(result).toBe("python3");
  });

  it("rejects Python < 3.12", async () => {
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _args: string[], ...rest: unknown[]) => {
        const cb = typeof rest[rest.length - 1] === "function"
          ? rest[rest.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
          : null;
        if (cb) {
          cb(null, { stdout: "Python 3.11.5\n", stderr: "" });
        }
      },
    );

    await expect(findPython()).rejects.toThrow("Python >= 3.12 is required");
  });

  it("throws when no Python found at all", async () => {
    mockExecFileError();
    await expect(findPython()).rejects.toThrow("Python >= 3.12 is required");
  });
});

describe("ensureVenv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFileSuccess("");
  });

  it("creates venv when it does not exist", async () => {
    (existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(false)  // venvPython doesn't exist
      .mockReturnValueOnce(false); // marker doesn't exist
    (statSync as ReturnType<typeof vi.fn>).mockReturnValue({ mtimeMs: 12345 });

    await ensureVenv("python3.12", "/data", "/server/requirements.txt");

    // Should call python -m venv
    expect(execFile).toHaveBeenCalledWith(
      "python3.12",
      ["-m", "venv", "/data/venv"],
      expect.any(Function),
    );
    // Should call pip install
    expect(execFile).toHaveBeenCalledWith(
      "/data/venv/bin/python",
      ["-m", "pip", "install", "-q", "--find-links", "/server/wheels", "-r", "/server/requirements.txt"],
      expect.objectContaining({ timeout: 300_000 }),
      expect.any(Function),
    );
  });

  it("skips venv creation when it already exists", async () => {
    (existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // venvPython exists
      .mockReturnValueOnce(true);  // marker exists
    (statSync as ReturnType<typeof vi.fn>).mockReturnValue({ mtimeMs: 12345 });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

    await ensureVenv("python3.12", "/data", "/server/requirements.txt");

    // Should NOT call python -m venv
    const venvCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => (call[1] as string[]).includes("venv"),
    );
    expect(venvCalls).toHaveLength(0);
  });

  it("skips pip install when marker matches requirements mtime", async () => {
    (existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // venvPython exists
      .mockReturnValueOnce(true);  // marker exists
    (statSync as ReturnType<typeof vi.fn>).mockReturnValue({ mtimeMs: 12345 });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

    await ensureVenv("python3.12", "/data", "/server/requirements.txt");

    const pipCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => (call[1] as string[]).includes("pip"),
    );
    expect(pipCalls).toHaveLength(0);
  });

  it("re-installs when requirements.txt mtime changes", async () => {
    (existsSync as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(true)   // venvPython exists
      .mockReturnValueOnce(true);  // marker exists
    (statSync as ReturnType<typeof vi.fn>).mockReturnValue({ mtimeMs: 99999 });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("12345");

    await ensureVenv("python3.12", "/data", "/server/requirements.txt");

    const pipCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => (call[1] as string[]).includes("pip"),
    );
    expect(pipCalls).toHaveLength(1);
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".pip-installed"),
      "99999",
    );
  });
});

describe("createServerManager", () => {
  function createMockProcess(): ChildProcess & EventEmitter {
    const proc = new EventEmitter() as ChildProcess & EventEmitter;
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    (proc as any).stdout = stdoutEmitter;
    (proc as any).stderr = stderrEmitter;
    (proc as any).kill = vi.fn().mockReturnValue(true);
    (proc as any).pid = 12345;
    return proc;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    // Default: findPython succeeds
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cmd: string, args: string[], ...rest: unknown[]) => {
        const cb = typeof rest[rest.length - 1] === "function"
          ? rest[rest.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
          : typeof rest[rest.length - 2] === "function"
            ? rest[rest.length - 2] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
            : null;
        if (cb) {
          if (args.includes("--version")) {
            cb(null, { stdout: "Python 3.12.1\n", stderr: "" });
          } else {
            cb(null, { stdout: "", stderr: "" });
          }
        }
      },
    );
    // venv already exists with current marker
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (statSync as ReturnType<typeof vi.fn>).mockReturnValue({ mtimeMs: 100 });
    (readFileSync as ReturnType<typeof vi.fn>).mockReturnValue("100");
  });

  it("isRunning returns false before start", () => {
    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });
    expect(manager.isRunning()).toBe(false);
  });

  it("start spawns uvicorn and waits for health", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);

    // Health check succeeds immediately
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
      env: { OPENAI_API_KEY: "test-key" },
      configPath: "/plugin/config.yaml",
    });

    await manager.start();

    expect(spawn).toHaveBeenCalledWith(
      "/data/venv/bin/python",
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001"],
      expect.objectContaining({
        cwd: "/server",
        env: expect.objectContaining({
          OPENAI_API_KEY: "test-key",
          CONFIG_PATH: "/plugin/config.yaml",
          FALKORDB_DATA_DIR: "/data/falkordb",
        }),
      }),
    );
    expect(manager.isRunning()).toBe(true);

    // Env should NOT contain FALKORDB_URI
    const spawnCall = (spawn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const passedEnv = spawnCall[2].env;
    expect(passedEnv.FALKORDB_URI).toBeUndefined();
  });

  it("stop sends SIGTERM to the process", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();
    expect(manager.isRunning()).toBe(true);

    // Simulate process exiting on SIGTERM
    (mockProc as any).kill.mockImplementation((sig: string) => {
      if (sig === "SIGTERM") {
        setTimeout(() => mockProc.emit("exit", 0, null), 10);
      }
      return true;
    });

    await manager.stop();
    expect((mockProc as any).kill).toHaveBeenCalledWith("SIGTERM");
    expect(manager.isRunning()).toBe(false);
  });
});
