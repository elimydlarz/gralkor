import * as oc from "../lib/openclaw.js";
import { buildConfigEntries, type ConfigInput } from "../lib/config.js";

export async function config(opts: ConfigInput): Promise<void> {
  try {
    await oc.checkOpenclaw();
  } catch {
    console.error("Error: openclaw not found on PATH");
    process.exitCode = 1;
    return;
  }

  const entries = buildConfigEntries(opts);
  if (entries.length === 0) {
    console.error("Nothing to set. Use --config '{...}' or --set key=value");
    process.exitCode = 1;
    return;
  }

  for (const [key, value] of entries) {
    console.log(`  → Set ${key} = ${value}`);
    await oc.setConfig(`plugins.entries.gralkor.config.${key}`, value);
  }

  console.log("\nDone.");
}
