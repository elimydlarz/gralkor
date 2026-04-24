import { execFile, type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { ModelConfig, OntologyConfig, OntologyAttributeValue } from "./config.js";
import { buildSyncEnv, buildPipEnv, buildSpawnEnv } from "./server-env.js";

const execFileAsync = promisify(execFile);

const HEALTH_POLL_INTERVAL_MS = 500;
const HEALTH_TIMEOUT_MS = 120_000;
const MONITOR_INTERVAL_MS = 60_000;
const STOP_GRACE_MS = 5_000;

/**
 * Path to the Python server source bundled with this package. Resolves at
 * runtime relative to this module's compiled location — at publish time the
 * server is copied into `<pkg>/server/` by `scripts/bundle-server.mjs`, and
 * this module ends up at `<pkg>/dist/server-manager.js`, so `../server`
 * resolves to the bundled directory. Mirrors the Elixir side's
 * `:code.priv_dir(:gralkor_ex) ++ "/server"`.
 */
export function bundledServerDir(): string {
  return fileURLToPath(new URL("../server", import.meta.url));
}

export interface ServerManagerOptions {
  dataDir: string;
  /**
   * Path to the Python server directory. Defaults to the bundled copy
   * that ships inside this npm package. Override if you want to point
   * at a development checkout of `gralkor/server/`.
   */
  serverDir?: string;
  port: number;
  /** Plugin version — used to fetch the arm64 wheel from GitHub Releases when not bundled. */
  version: string;
  env?: Record<string, string>;
  secretEnv?: Record<string, string>;
  llmConfig?: ModelConfig;
  embedderConfig?: ModelConfig;
  ontologyConfig?: OntologyConfig;
  test?: boolean;
}

// Bundled wheel filename — must match scripts/build-arm64-wheel.sh output.
const WHEEL_FILENAME = "falkordblite-0.9.0-py3-none-manylinux_2_36_aarch64.whl";
const WHEEL_REPO = "elimydlarz/gralkor";

export interface ServerManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
}

export function createServerManager(opts: ServerManagerOptions): ServerManager {
  const serverDir = opts.serverDir ?? bundledServerDir();
  let proc: ChildProcess | null = null;
  let monitorTimer: ReturnType<typeof setInterval> | undefined;

  async function start(): Promise<void> {
    const bootStart = Date.now();

    await mkdir(opts.dataDir, { recursive: true });

    console.log("[gralkor] boot: starting...");

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

    // Sync Python environment.
    // Skip falkordblite when a bundled arch-specific wheel is present — the PyPI
    // arm64 wheel requires manylinux_2_39 (glibc 2.39+) but many linux/arm64 hosts
    // run glibc 2.36 (Debian Bookworm), causing uv to fall back to the sdist which
    // embeds x86-64 binaries. The bundled wheel is built for the correct arch.
    // On linux/arm64, PyPI's falkordblite sdist embeds x86-64 binaries on
    // glibc < 2.39 hosts (e.g. Bookworm), so we must install a prebuilt wheel.
    // Look for it bundled in the install (npm path), else download from
    // GitHub Releases (ClawHub path — wheel exceeds ClawHub's 20 MB limit).
    const useBundledWheels = process.platform === "linux" && process.arch === "arm64";
    const bundledWheels = useBundledWheels
      ? await resolveBundledWheels(serverDir, opts.dataDir, opts.version)
      : [];

    const syncEnv = buildSyncEnv(venvDir);

    const syncArgs = [
      "sync", "--no-dev", "--frozen", "--directory", serverDir,
      ...(bundledWheels.length > 0 ? ["--no-install-package", "falkordblite"] : []),
    ];

    console.log("[gralkor] boot: syncing python env...");
    await execFileAsync("uv", syncArgs, { env: syncEnv, timeout: 300_000 });
    console.log("[gralkor] boot: python env ready");

    // Install bundled wheels — no PyPI fallback, must succeed.
    const pipEnv = buildPipEnv(venvDir);
    for (const wheelPath of bundledWheels) {
      console.log("[gralkor] Installing bundled wheel:", wheelPath);
      await execFileAsync(
        "uv",
        ["pip", "install", "--no-deps", wheelPath],
        { env: pipEnv, timeout: 60_000 },
      );
    }

    const configPath = join(opts.dataDir, "config.yaml");
    await writeFile(configPath, buildConfigYaml(opts), "utf-8");

    const env = buildSpawnEnv({
      extra: opts.env,
      secretEnv: opts.secretEnv,
      falkordbDataDir: join(opts.dataDir, "falkordb"),
      configPath,
    });

    // Kill whatever holds the port — we reserve it. No discrimination; if a
    // process is on our port, it doesn't belong there. This covers: our prior
    // incarnation after module re-eval, an orphan from a crashed host, or any
    // other collision.
    await killHoldersOfPort(opts.port);

    console.log("[gralkor] Starting Graphiti server on port", opts.port);

    proc = spawn(
      venvPython,
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(opts.port), "--no-access-log"],
      {
        cwd: serverDir,
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

    proc.on("error", (err) => {
      console.error("[gralkor] Server process error:", err.message);
    });

    proc.on("exit", (code, signal) => {
      console.log("[gralkor] Server process exited — code:", code, "signal:", signal);
      proc = null;
    });

    console.log("[gralkor] boot: server process spawned (pid:", proc.pid, "), polling health...");

    // Wait for server to become healthy
    await waitForHealth(opts.port);
    console.log("[gralkor] boot: server healthy");

    const bootDuration = ((Date.now() - bootStart) / 1000).toFixed(1);
    console.log(`[gralkor] boot: ready (${bootDuration}s)`);

    // Start health monitor
    monitorTimer = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${opts.port}/health`);
        await res.text(); // Drain response body to prevent memory leak
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

function providerSection(key: "llm" | "embedder", cfg: ModelConfig | undefined): string {
  if (!cfg) return "";
  return `${key}:\n  provider: "${cfg.provider}"\n  model: "${cfg.model}"`;
}

/**
 * Build the `config.yaml` contents for the Python server.
 *
 * Sections are emitted only when the consumer passes that piece of config.
 * When `llmConfig` / `embedderConfig` are omitted, the corresponding blocks
 * are absent from the YAML and the server falls back to its own defaults in
 * `server/main.py` — the single source of truth for model choice.
 */
export function buildConfigYaml(opts: {
  llmConfig?: ModelConfig;
  embedderConfig?: ModelConfig;
  ontologyConfig?: OntologyConfig;
  test?: boolean;
}): string {
  const sections: string[] = [
    providerSection("llm", opts.llmConfig),
    providerSection("embedder", opts.embedderConfig),
  ].filter((s) => s !== "");
  if (opts.test) sections.push("test: true");
  if (opts.ontologyConfig) sections.push(serializeOntologyYaml(opts.ontologyConfig).trimEnd());
  return sections.length === 0 ? "" : sections.join("\n") + "\n";
}

function yamlQuote(s: string): string {
  if (/[:#{}[\]|>&*!%@`]/.test(s) || s !== s.trim()) {
    return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `"${s}"`;
}

function serializeAttrValue(attr: OntologyAttributeValue, indent: string): string {
  if (typeof attr === "string") {
    return ` ${yamlQuote(attr)}`;
  }
  if (Array.isArray(attr)) {
    return "\n" + attr.map((v) => `${indent}  - ${yamlQuote(v)}`).join("\n");
  }
  if ("enum" in attr) {
    const lines = [
      `\n${indent}  enum:`,
      ...attr.enum.map((v) => `${indent}    - ${yamlQuote(v)}`),
      `${indent}  description: ${yamlQuote(attr.description)}`,
    ];
    return lines.join("\n");
  }
  // { type, description }
  return [
    "",
    `${indent}  type: ${yamlQuote(attr.type)}`,
    `${indent}  description: ${yamlQuote(attr.description)}`,
  ].join("\n");
}

function serializeTypeDefs(
  defs: Record<string, { description: string; attributes?: Record<string, OntologyAttributeValue> }>,
  indent: string,
): string[] {
  const lines: string[] = [];
  for (const [name, def] of Object.entries(defs)) {
    lines.push(`${indent}${name}:`);
    lines.push(`${indent}  description: ${yamlQuote(def.description)}`);
    if (def.attributes && Object.keys(def.attributes).length > 0) {
      lines.push(`${indent}  attributes:`);
      for (const [attr, val] of Object.entries(def.attributes)) {
        lines.push(`${indent}    ${attr}:${serializeAttrValue(val, `${indent}    `)}`);
      }
    }
  }
  return lines;
}

export function serializeOntologyYaml(ontology: OntologyConfig): string {
  const lines: string[] = ["ontology:"];

  if (ontology.entities && Object.keys(ontology.entities).length > 0) {
    lines.push("  entities:");
    lines.push(...serializeTypeDefs(ontology.entities, "    "));
  }

  if (ontology.edges && Object.keys(ontology.edges).length > 0) {
    lines.push("  edges:");
    lines.push(...serializeTypeDefs(ontology.edges, "    "));
  }

  if (ontology.edgeMap && Object.keys(ontology.edgeMap).length > 0) {
    lines.push("  edgeMap:");
    for (const [key, values] of Object.entries(ontology.edgeMap)) {
      lines.push(`    ${yamlQuote(key)}:`);
      for (const v of values) {
        lines.push(`      - ${yamlQuote(v)}`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

async function resolveBundledWheels(serverDir: string, dataDir: string, version: string): Promise<string[]> {
  const installed = join(serverDir, "wheels");
  if (existsSync(installed)) {
    const files = readdirSync(installed).filter((f) => f.endsWith(".whl"));
    if (files.length > 0) return files.map((f) => join(installed, f));
  }
  const dest = join(dataDir, "wheels", WHEEL_FILENAME);
  if (!existsSync(dest)) {
    await mkdir(join(dataDir, "wheels"), { recursive: true });
    const url = `https://github.com/${WHEEL_REPO}/releases/download/v${version}/${WHEEL_FILENAME}`;
    console.log(`[gralkor] boot: downloading wheel ${url}`);
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`bundled wheel download failed: HTTP ${res.status} ${url}`);
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  }
  return [dest];
}

async function killHoldersOfPort(port: number): Promise<void> {
  const pids = await findPortHolders(port);
  if (pids.length === 0) return;

  console.log(`[gralkor] boot: port ${port} held by pid(s) ${pids.join(",")} — killing`);
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch { /* already gone */ }
  }

  if (await waitForPortFree(port, 5_000)) return;

  for (const pid of await findPortHolders(port)) {
    try { process.kill(pid, "SIGKILL"); } catch { /* already gone */ }
  }

  if (!(await waitForPortFree(port, 2_000))) {
    throw new Error(`port ${port} still bound after SIGTERM+SIGKILL`);
  }
}

async function findPortHolders(port: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]);
    return stdout.split("\n").map(s => Number(s.trim())).filter(n => Number.isInteger(n) && n > 0);
  } catch {
    // lsof exits non-zero when nothing matches — treat as empty
    return [];
  }
}

async function waitForPortFree(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await findPortHolders(port)).length === 0) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const start = Date.now();
  let polls = 0;
  let lastError = "";

  while (Date.now() < deadline) {
    polls++;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        console.log(`[gralkor] boot: health poll succeeded after ${polls} attempts (${((Date.now() - start) / 1000).toFixed(1)}s)`);
        return;
      }
      const newError = `HTTP ${res.status}`;
      if (newError !== lastError) {
        console.log(`[gralkor] boot: health poll — ${newError}`);
        lastError = newError;
      }
    } catch (err) {
      const newError = err instanceof Error ? err.message : String(err);
      if (newError !== lastError) {
        console.log(`[gralkor] boot: health poll — ${newError}`);
        lastError = newError;
      }
    }
    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }

  throw new Error(
    `Graphiti server did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s (${polls} polls, last error: ${lastError})`,
  );
}
