import { execFile, type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { DEFAULT_LLM_PROVIDER, DEFAULT_LLM_MODEL, DEFAULT_EMBEDDER_PROVIDER, DEFAULT_EMBEDDER_MODEL, type LlmConfig, type EmbedderConfig, type OntologyConfig, type OntologyAttributeValue } from "./config.js";

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
  llmConfig?: LlmConfig;
  embedderConfig?: EmbedderConfig;
  ontologyConfig?: OntologyConfig;
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

    console.log("[gralkor] Syncing Python environment with uv...");
    await execFileAsync(
      "uv",
      ["sync", "--no-dev", "--frozen", "--directory", opts.serverDir],
      { env: syncEnv, timeout: 300_000 },
    );
    console.log("[gralkor] Python environment ready");

    // Force-install bundled wheels to override broken PyPI packages.
    // UV_FIND_LINKS doesn't work with `uv sync --frozen` (lockfile hash
    // verification rejects locally-built wheels), so we use a separate
    // `uv pip install` step that bypasses the lockfile entirely.
    const wheelsDir = join(opts.serverDir, "wheels");
    if (existsSync(wheelsDir)) {
      const wheelPaths = readdirSync(wheelsDir)
        .filter((f) => f.endsWith(".whl"))
        .map((f) => join(wheelsDir, f));
      for (const wheelPath of wheelPaths) {
        try {
          console.log("[gralkor] Installing bundled wheel:", wheelPath);
          await execFileAsync(
            "uv",
            ["pip", "install", "--reinstall", "--no-deps", wheelPath, "--python", venvPython],
            { timeout: 60_000 },
          );
        } catch {
          // Wheel might not be compatible with this platform (e.g. arm64
          // wheel on a macOS dev machine) — that's OK, uv sync already
          // installed compatible packages from PyPI.
          console.log("[gralkor] Bundled wheel not compatible, using PyPI version");
        }
      }
    }

    // Write dynamic config.yaml from plugin settings (with defaults)
    const configPath = join(opts.dataDir, "config.yaml");
    const configYaml = [
      "llm:",
      `  provider: "${opts.llmConfig?.provider ?? DEFAULT_LLM_PROVIDER}"`,
      `  model: "${opts.llmConfig?.model ?? DEFAULT_LLM_MODEL}"`,
      "embedder:",
      `  provider: "${opts.embedderConfig?.provider ?? DEFAULT_EMBEDDER_PROVIDER}"`,
      `  model: "${opts.embedderConfig?.model ?? DEFAULT_EMBEDDER_MODEL}"`,
      "",
    ].join("\n");
    await writeFile(configPath, configYaml, "utf-8");

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...opts.env,
      FALKORDB_DATA_DIR: join(opts.dataDir, "falkordb"),
      CONFIG_PATH: configPath,
    };

    // Do NOT set FALKORDB_URI — its absence triggers embedded FalkorDBLite mode
    delete env.FALKORDB_URI;

    console.log("[gralkor] Starting Graphiti server on port", opts.port);

    proc = spawn(
      venvPython,
      ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(opts.port), "--no-access-log"],
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

  if (ontology.excludedEntityTypes && ontology.excludedEntityTypes.length > 0) {
    lines.push("  excludedEntityTypes:");
    for (const name of ontology.excludedEntityTypes) {
      lines.push(`    - ${yamlQuote(name)}`);
    }
  }

  return lines.join("\n") + "\n";
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
