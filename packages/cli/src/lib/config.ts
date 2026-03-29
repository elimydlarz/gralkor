export interface ConfigInput {
  config?: string;
  set?: string[];
}

/** Parse --config JSON and --set key=value pairs into flat [key, value] entries. */
export function buildConfigEntries(opts: ConfigInput): Array<[string, string]> {
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
