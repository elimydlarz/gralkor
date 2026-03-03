import { execFile, type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_TIMEOUT_MS = 120_000;
const MONITOR_INTERVAL_MS = 60_000;
const STOP_GRACE_MS = 5_000;

export interface ServerManagerOptions {
  dataDir: string;
  serverDir: string;
  port: number;
  env?: Record<string, string>;
  configPath?: string;
}

export interface ServerManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function createServerManager(opts: ServerManagerOptions): ServerManager {
  let proc: ChildProcess | null = null;
  let monitorTimer: ReturnType<typeof setInterval> | undefined;

  async function start(): Promise<void> {
    if (proc) return;

    await mkdir(opts.dataDir, { recursive: true });

    const venvDir = join(opts.dataDir, "venv");
    const venvPython = join(venvDir, "bin", "python");

    // Ensure uv is available
    try {
      await execFileAsync("uv", ["--version"]);
    } catch {
      throw new Error(
        "uv is required but not found on PATH. " +
        "Install: curl -LsSf https://astral.sh/uv/install.sh | sh",
      );
    }

    // Sync Python environment
    const syncEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      UV_PROJECT_ENVIRONMENT: venvDir,
    };
    const wheelsDir = join(opts.serverDir, "wheels");
    if (existsSync(wheelsDir)) {
      syncEnv.UV_FIND_LINKS = wheelsDir;
    }

    console.log("[gralkor] Syncing Python environment with uv...");
    await execFileAsync(
      "uv",
      ["sync", "--no-dev", "--frozen", "--directory", opts.serverDir],
      { env: syncEnv, timeout: 300_000 },
    );
    console.log("[gralkor] Python environment ready");

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...opts.env,
      FALKORDB_DATA_DIR: join(opts.dataDir, "falkordb"),
    };

    if (opts.configPath) {
      env.CONFIG_PATH = opts.configPath;
    }

    // Do NOT set FALKORDB_URI — its absence triggers embedded FalkorDBLite mode
    delete env.FALKORDB_URI;

    console.log("[gralkor] Starting Graphiti server on port", opts.port);

    proc = spawn(
      venvPython,
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(opts.port)],
      {
        cwd: opts.serverDir,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    // Forward stdout/stderr
    proc.stdout?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        console.log("[gralkor] [server]", line);
      }
    });
    proc.stderr?.on("data", (data: Buffer) => {
      for (const line of data.toString().split("\n").filter(Boolean)) {
        console.log("[gralkor] [server]", line);
      }
    });

    proc.on("exit", (code, signal) => {
      console.log("[gralkor] Server process exited — code:", code, "signal:", signal);
      proc = null;
    });

    // Wait for server to become healthy
    await waitForHealth(opts.port);
    console.log("[gralkor] Server is healthy");

    // Start health monitor
    monitorTimer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${opts.port}/health`);
        if (!res.ok) {
          console.warn("[gralkor] Server health check returned", res.status);
        }
      } catch (err) {
        console.warn(
          "[gralkor] Server health check failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }, MONITOR_INTERVAL_MS);
  }

  async function stop(): Promise<void> {
    if (monitorTimer) {
      clearInterval(monitorTimer);
      monitorTimer = undefined;
    }

    if (!proc) return;

    const child = proc;
    proc = null;

    // Try graceful SIGTERM first
    child.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const forceKill = setTimeout(() => {
        child.kill("SIGKILL");
        resolve();
      }, STOP_GRACE_MS);

      child.on("exit", () => {
        clearTimeout(forceKill);
        resolve();
      });
    });
  }

  function isRunning(): boolean {
    return proc !== null;
  }

  return { start, stop, isRunning };
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Graphiti server did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s`,
  );
}
