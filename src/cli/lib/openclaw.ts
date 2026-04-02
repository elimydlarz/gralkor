import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface PluginInfo {
  id: string;
  version: string | null;
  enabled: boolean;
}

async function openclaw(...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("openclaw", args, {
    timeout: 30_000,
  });
  return stdout;
}

export async function checkOpenclaw(): Promise<string> {
  return (await openclaw("--version")).trim();
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
  return parsePluginList(await openclaw("plugins", "list"));
}

export async function getPluginInfo(pluginId: string): Promise<PluginInfo | null> {
  const plugins = await getInstalledPlugins();
  return plugins.find((p) => p.id === pluginId) ?? null;
}

export async function installPlugin(source: string): Promise<void> {
  await openclaw("plugins", "install", source);
}

export async function uninstallPlugin(pluginId: string): Promise<void> {
  await openclaw("plugins", "uninstall", pluginId);
}

export async function setConfig(key: string, value: string): Promise<void> {
  await openclaw("config", "set", key, value);
}

export async function getConfig(key: string): Promise<string | null> {
  try {
    const val = (await openclaw("config", "get", key)).trim();
    return val || null;
  } catch {
    return null;
  }
}
