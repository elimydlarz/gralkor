import { existsSync } from "node:fs";
import * as oc from "../lib/openclaw.js";
import { buildConfigEntries } from "../lib/config.js";
import { extractVersionFromTarball, extractVersionFromNpmRef, compareVersions } from "../lib/version.js";

export interface InstallOptions {
  source: string;
  config?: string;
  set?: string[];
}

interface Action {
  description: string;
  execute: () => Promise<void>;
}

export async function install(opts: InstallOptions): Promise<void> {
  const { source } = opts;
  const actions: Action[] = [];
  const log = (msg: string) => console.log(msg);

  // 1. Check openclaw
  try {
    await oc.checkOpenclaw();
  } catch {
    console.error("Error: openclaw not found on PATH");
    process.exitCode = 1;
    return;
  }

  // 2. Validate source
  const isFilePath = source.endsWith(".tgz") || (source.includes("/") && !source.startsWith("@"));
  if (isFilePath && !existsSync(source)) {
    console.error(`Error: file not found: ${source}`);
    process.exitCode = 1;
    return;
  }

  const targetVersion = extractVersionFromTarball(source) ?? extractVersionFromNpmRef(source);

  let plugins: oc.PluginInfo[];
  try {
    plugins = await oc.getInstalledPlugins();
  } catch {
    log("Could not list plugins — proceeding with fresh install");
    plugins = [];
  }
  // 4. Check if gralkor already installed
  const current = plugins.find((p) => p.id === "gralkor");
  let needsInstall = true;

  if (current && targetVersion && current.version) {
    const cmp = compareVersions(current.version, targetVersion);
    if (cmp === 0) {
      log(`gralkor ${targetVersion} already installed`);
      needsInstall = false;
    } else {
      log(`Upgrading gralkor ${current.version} → ${targetVersion}`);
      actions.push({
        description: `Uninstall gralkor ${current.version}`,
        execute: () => oc.uninstallPlugin("gralkor"),
      });
    }
  } else if (current && !targetVersion) {
    // Can't compare — reinstall
    log(`gralkor installed (${current.version ?? "unknown version"}), reinstalling from source`);
    actions.push({
      description: "Uninstall current gralkor",
      execute: () => oc.uninstallPlugin("gralkor"),
    });
  }

  // 5. Install
  if (needsInstall) {
    actions.push({
      description: `Install gralkor from ${source}`,
      execute: async () => {
        await oc.installPlugin(source);
        // Verify the plugin is actually discoverable after install.
        // openclaw plugins install can exit 0 (via config-warning tolerance)
        // even when the install silently failed.
        const after = await oc.getInstalledPlugins().catch(() => []);
        if (!after.find((p) => p.id === "gralkor")) {
          throw new Error(
            "openclaw plugins install appeared to succeed but gralkor is not in the plugin list. " +
            "Run `openclaw plugins install @susu-eng/gralkor@latest` manually to see the full error."
          );
        }
      },
    });
  }

  // 6. Config
  const configEntries = buildConfigEntries(opts);
  for (const [key, value] of configEntries) {
    actions.push({
      description: `Set config ${key} = ${value}`,
      execute: () => oc.setConfig(`plugins.entries.gralkor.config.${key}`, value),
    });
  }

  for (const action of actions) {
    log(`  → ${action.description}`);
    await action.execute();
  }

  log("\nDone.");
}
