import * as oc from "../lib/openclaw.js";

export interface ConfigOptions {
  config?: string;
  set?: string[];
}

export async function config(opts: ConfigOptions): Promise<void> {
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

function buildConfigEntries(opts: ConfigOptions): Array<[string, string]> {
  const entries: Array<[string, string]> = [];

  if (opts.config) {
    try {
      const parsed = JSON.parse(opts.config);
      flattenObject(parsed, "", entries);
    } catch {
      console.error(`Error: invalid --config JSON: ${opts.config}`);
      process.exitCode = 1;
    }
  }

  if (opts.set) {
    for (const pair of opts.set) {
      const eq = pair.indexOf("=");
      if (eq === -1) {
        console.error(`Error: invalid --set format, expected key=value: ${pair}`);
        process.exitCode = 1;
        continue;
      }
      entries.push([pair.slice(0, eq), pair.slice(eq + 1)]);
    }
  }

  return entries;
}

function flattenObject(
  obj: Record<string, unknown>,
  prefix: string,
  out: Array<[string, string]>,
): void {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value as Record<string, unknown>, path, out);
    } else {
      out.push([path, String(value)]);
    }
  }
}
