#!/usr/bin/env node
// Copy gralkor/server/ into gralkor/ts/server/ as a build artifact that ships
// with the npm tarball. Mirrors the Elixir :gralkor_ex package's
// compile.gralkor_priv compiler (which copies ../server/ into ex/priv/server/).
// Exclusions match that compiler's skip list.

import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const tsRoot = resolve(__dirname, "..");
const gralkorRoot = resolve(tsRoot, "..");
const src = join(gralkorRoot, "server");
const dest = join(tsRoot, "server");

const SKIP_DIRS = new Set([
  ".venv",
  ".pytest_cache",
  "__pycache__",
  "wheels",
  "tests",
  "mutants",
  "tmp",
]);
const SKIP_EXT = new Set([".pyc"]);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(src))) {
    console.error(`[bundle-server] source not found: ${src}`);
    process.exit(1);
  }

  await rm(dest, { recursive: true, force: true });
  await mkdir(dest, { recursive: true });

  await cp(src, dest, {
    recursive: true,
    filter(path) {
      const name = path.split("/").pop() ?? "";
      if (SKIP_DIRS.has(name)) return false;
      for (const ext of SKIP_EXT) {
        if (name.endsWith(ext)) return false;
      }
      return true;
    },
  });

  console.log(`[bundle-server] copied ${src} → ${dest}`);
}

main().catch((err) => {
  console.error("[bundle-server] failed:", err);
  process.exit(1);
});
