import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PluginInfo {
  id: string;
  version: string | null;
  enabled: boolean;
}

async function exec(args: string[]): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFileAsync("openclaw", args, {
      timeout: 30_000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err: unknown) {
    if (isExecError(err)) {
      const stdout = err.stdout ?? "";
      const stderr = err.stderr ?? "";
      const exitCode = err.code ?? 1;
      // openclaw exits non-zero for stale config warnings (e.g. plugins.allow
      // referencing a not-yet-installed plugin). These are harmless — treat as success.
      if (isConfigWarningOnly(stderr || stdout)) {
        return { stdout, stderr, exitCode: 0 };
      }
      return { stdout, stderr, exitCode };
    }
    throw new Error(
      "openclaw not found on PATH. Install: https://docs.openclaw.ai/install"
    );
  }
}

function isExecError(
  err: unknown
): err is Error & { stdout?: string; stderr?: string; code?: number } {
  return err instanceof Error && "code" in err;
}

export async function checkOpenclaw(): Promise<string> {
  const result = await exec(["--version"]);
  if (result.exitCode !== 0) {
    throw new Error("openclaw returned non-zero exit code");
  }
  return result.stdout.trim();
}

/** Parse `openclaw plugins list` output into structured plugin info. */
export function parsePluginList(stdout: string): PluginInfo[] {
  const plugins: PluginInfo[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("─") || trimmed.toLowerCase().startsWith("name")) continue;

    // Try table format: "name  version  enabled  kind"
    const parts = trimmed.split(/\s{2,}/);
    if (parts.length >= 3) {
      plugins.push({
        id: parts[0],
        version: parts[1] === "-" ? null : parts[1],
        enabled: parts[2].toLowerCase() === "true" || parts[2] === "✓",
      });
    }
  }
  return plugins;
}

export async function getInstalledPlugins(): Promise<PluginInfo[]> {
  const result = await exec(["plugins", "list"]);
  if (result.exitCode !== 0) {
    throw new Error(`Failed to list plugins: ${result.stderr}`);
  }
  return parsePluginList(result.stdout);
}

export async function getPluginInfo(pluginId: string): Promise<PluginInfo | null> {
  const plugins = await getInstalledPlugins();
  return plugins.find((p) => p.id === pluginId) ?? null;
}

/**
 * Check if openclaw output contains only config warnings (no real errors).
 * openclaw plugins install exits non-zero for stale config references
 * (e.g. plugins.allow referencing a not-yet-installed plugin).
 * These are harmless — the install succeeded despite the exit code.
 */
export function isConfigWarningOnly(output: string): boolean {
  return output.includes("Config warnings:") &&
    !output.includes("ENOENT") &&
    !output.includes("npm error") &&
    !output.includes("404");
}

export async function installPlugin(source: string): Promise<void> {
  const result = await exec(["plugins", "install", source]);
  if (result.exitCode !== 0) {
    throw new Error(`Install failed: ${result.stderr || result.stdout}`);
  }
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  const result = await exec(["plugins", "uninstall", pluginId]);
  if (result.exitCode !== 0) {
    throw new Error(`Uninstall failed: ${result.stderr || result.stdout}`);
  }
}


export async function enablePlugin(pluginId: string): Promise<void> {
  const result = await exec(["plugins", "enable", pluginId]);
  if (result.exitCode !== 0) {
    throw new Error(`Enable failed: ${result.stderr || result.stdout}`);
  }
}

export async function setConfig(key: string, value: string): Promise<void> {
  const result = await exec(["config", "set", key, value]);
  if (result.exitCode !== 0) {
    throw new Error(`Config set failed: ${result.stderr || result.stdout}`);
  }
}

export async function getConfig(key: string): Promise<string | null> {
  const result = await exec(["config", "get", key]);
  if (result.exitCode !== 0) return null;
  const val = result.stdout.trim();
  return val || null;
}
