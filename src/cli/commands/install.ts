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

  // 3. Clear stale memory slot before listing plugins.
  // The init script or prior install may have set plugins.slots.memory: gralkor
  // before the plugin directory exists, making all openclaw commands fail with
  // "Config invalid: plugin not found". Clear it upfront — we'll set it back
  // at the end after install succeeds.
  await oc.setConfig("plugins.slots.memory", "").catch(() => {});

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
    } else if (cmp > 0) {
      log(`Warning: installed ${current.version} is newer than source ${targetVersion}`);
      console.error("Use --force to downgrade (not yet supported)");
      process.exitCode = 1;
      return;
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
  } else if (!current) {
    // Plugin not in list but directory may exist (untracked local code) — clean up.
    // uninstallPlugin may fail if the plugin isn't tracked, so fall back to
    // removing the extension directory directly.
    actions.push({
      description: "Remove stale gralkor install (if present)",
      execute: async () => {
        await oc.uninstallPlugin("gralkor").catch(() => {});
        await oc.removePluginDir("gralkor");
      },
    });
  }

  // 5. Install
  if (needsInstall) {
    actions.push({
      description: `Install gralkor from ${source}`,
      execute: () => oc.installPlugin(source),
    });
  }

  // 6. Enable + slot
  actions.push({
    description: "Enable gralkor",
    execute: () => oc.enablePlugin("gralkor"),
  });
  actions.push({
    description: "Set memory slot → gralkor",
    execute: () => oc.setConfig("plugins.slots.memory", "gralkor"),
  });

  // 7. Config
  const configEntries = buildConfigEntries(opts);
  for (const [key, value] of configEntries) {
    actions.push({
      description: `Set config ${key} = ${value}`,
      execute: () => oc.setConfig(`plugins.entries.gralkor.config.${key}`, value),
    });
  }

  // Execute or dry-run
  if (dryRun) {
    log("\nDry run — would execute:");
    for (const action of actions) {
      log(`  → ${action.description}`);
    }
    return;
  }

  for (const action of actions) {
    log(`  → ${action.description}`);
    await action.execute();
  }

  log("\nDone.");
}
