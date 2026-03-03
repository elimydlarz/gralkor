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
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
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
      configPath: "/plugin/config.yaml",
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

  it("passes UV_FIND_LINKS when wheels dir exists", async () => {
    const mockProc = createMockProcess();
    (spawn as unknown as ReturnType<typeof vi.fn>).mockReturnValue(mockProc);
    mockFetch.mockResolvedValue({ ok: true });
    // wheels dir exists
    (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const manager = createServerManager({
      dataDir: "/data",
      serverDir: "/server",
      port: 8001,
    });

    await manager.start();

    const execFileCalls = (execFile as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const syncOpts = execFileCalls[1][2];
    expect(syncOpts.env.UV_FIND_LINKS).toBe("/server/wheels");
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
