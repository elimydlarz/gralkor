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
  readdirSync: vi.fn().mockReturnValue([]),
}));

// Mock fs/promises
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { execFile, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServerManager } from "./server-manager.js";
import { EventEmitter } from "node:events";

function mockExecFileSuccess(stdout: string) {
  (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    (_cmd: string, _args: string[], ...rest: unknown[]) => {
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
    // Default: uv --version and uv sync succeed
    mockExecFileSuccess("");
    // No wheels dir by default
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
    (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([]);
    // Default: no pid file
    mockReadFile.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  });

  it("isRunning returns false before start", () => {
    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });
    expect(manager.isRunning()).toBe(false);
  });

  it("start calls uv sync and spawns uvicorn", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
      env: { OPENAI_API_KEY: "test-key" },
    });

    await manager.start();

    // Should check uv is available
    const execFileCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(execFileCalls[0][0]).toBe("uv");
    expect(execFileCalls[0][1]).toEqual(["--version"]);

    // Should call uv sync
    expect(execFileCalls[1][0]).toBe("uv");
    expect(execFileCalls[1][1]).toEqual(["sync", "--no-dev", "--frozen", "--directory", "/server"]);
    const syncOpts = execFileCalls[1][2];
    expect(syncOpts.env.UV_PROJECT_ENVIRONMENT).toBe("/data/venv");
    expect(syncOpts.timeout).toBe(300_000);

    // Should spawn uvicorn with venv python
    expect(spawn).toHaveBeenCalledWith(
      "/data/venv/bin/python",
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8001", "--no-access-log"],
      expect.objectContaining({
        cwd: "/server",
        env: expect.objectContaining({
          OPENAI_API_KEY: "test-key",
          CONFIG_PATH: "/data/config.yaml",
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

  it("skips falkordblite in uv sync and installs from bundled wheel", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });
    // wheels dir exists with a wheel file
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
      "falkordblite-0.9.0-py3-none-manylinux_2_36_aarch64.whl",
    ]);

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();

    const execFileCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;

    // uv sync must exclude falkordblite so the PyPI version (x86-64 sdist) is never installed
    expect(execFileCalls[1][1]).toEqual([
      "sync", "--no-dev", "--frozen", "--directory", "/server",
      "--no-install-package", "falkordblite",
    ]);

    // uv pip install uses VIRTUAL_ENV (not --python) and no --reinstall
    expect(execFileCalls[2][0]).toBe("uv");
    expect(execFileCalls[2][1]).toEqual([
      "pip", "install", "--no-deps",
      "/server/wheels/falkordblite-0.9.0-py3-none-manylinux_2_36_aarch64.whl",
    ]);
    expect(execFileCalls[2][2].env.VIRTUAL_ENV).toBe("/data/venv");
  });

  it("skips wheel install when wheels dir has no .whl files", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });
    // wheels dir exists but empty
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([".gitkeep"]);

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();

    const execFileCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    // Only uv --version and uv sync, no pip install
    expect(execFileCalls).toHaveLength(2);
  });

  it("throws when bundled wheel install fails", async () => {
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
    (readdirSync as ReturnType<typeof vi.fn>).mockReturnValue([
      "falkordblite-0.9.0-py3-none-manylinux_2_36_aarch64.whl",
    ]);

    // uv --version succeeds, uv sync succeeds, uv pip install FAILS
    let callCount = 0;
    (execFile as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_cmd: string, _args: string[], ...rest: unknown[]) => {
        callCount++;
        const cb = typeof rest[rest.length - 1] === "function"
          ? rest[rest.length - 1] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
          : typeof rest[rest.length - 2] === "function"
            ? rest[rest.length - 2] as (err: Error | null, result?: { stdout: string; stderr: string }) => void
            : null;
        if (cb) {
          if (callCount <= 2) {
            cb(null, { stdout: "", stderr: "" });
          } else {
            cb(new Error("No matching distribution found"));
          }
        }
      },
    );

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    // Must throw — no silent fallback to x86-64 PyPI version
    await expect(manager.start()).rejects.toThrow("No matching distribution found");
  });

  it("throws when uv is not found", async () => {
    mockExecFileError();

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await expect(manager.start()).rejects.toThrow("uv is required");
  });

  it("writes config.yaml to dataDir with default values", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();

    expect(mockWriteFile).toHaveBeenCalledWith(
      "/data/config.yaml",
      expect.stringContaining('provider: "gemini"'),
      "utf-8",
    );
    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('model: "gemini-3.1-flash-lite-preview"');
    expect(written).toContain('model: "gemini-embedding-2-preview"');
  });

  it("writes config.yaml with user-provided llm/embedder values", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
      llmConfig: { provider: "gemini", model: "gemini-2.0-flash" },
      embedderConfig: { provider: "gemini", model: "text-embedding-004" },
    });

    await manager.start();

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain('provider: "gemini"');
    expect(written).toContain('model: "gemini-2.0-flash"');
    expect(written).toContain('model: "text-embedding-004"');
  });

  it("writes config.yaml with ontology section when provided", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
      ontologyConfig: {
        entities: {
          Project: {
            description: "A project.",
            attributes: { status: ["active", "paused"] },
          },
        },
      },
    });

    await manager.start();

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).toContain("ontology:");
    expect(written).toContain("  entities:");
    expect(written).toContain("    Project:");
  });

  it("omits ontology section when not configured", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();

    const written = mockWriteFile.mock.calls[0][1] as string;
    expect(written).not.toContain("ontology:");
  });

  it("when the port is already healthy, adopts without running setup or spawning", async () => {
    mockFetch.mockResolvedValue({ ok: true, text: vi.fn().mockResolvedValue("") });

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();

    expect(execFile).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    const pidWrites = mockWriteFile.mock.calls.filter((c: unknown[]) =>
      typeof c[0] === "string" && (c[0] as string).includes("server.pid"),
    );
    expect(pidWrites).toHaveLength(0);
  });

  it("when a previous pid is on record, sends SIGTERM and waits before spawning", async () => {
    vi.useFakeTimers();
    // Pre-flight #1 fails (no server yet); pre-flight #2 + waitForPortFree + waitForHealth use
    // { ok: true } without .text() — res.text() throws, which is caught and treated as
    // "not responding" in both pre-flight checks and waitForPortFree (port considered free).
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValue({ ok: true });
    mockReadFile.mockResolvedValueOnce("1234");

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    const startPromise = manager.start();
    await vi.advanceTimersByTimeAsync(2000);
    await startPromise;

    expect(killSpy).toHaveBeenCalledWith(1234, "SIGTERM");
    expect(spawn).toHaveBeenCalled();

    killSpy.mockRestore();
    vi.useRealTimers();
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
