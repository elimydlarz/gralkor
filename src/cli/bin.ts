#!/usr/bin/env node
import { parseArgs } from "node:util";
import { install } from "./commands/install.js";
import { config } from "./commands/config.js";
import { check } from "./commands/check.js";
import { status } from "./commands/status.js";
import { getCLIVersion } from "./lib/version.js";

const DEFAULT_SOURCE = "@susu-eng/gralkor";

const HELP = `Usage: gralkor <command> [options]

Commands:
  install [source]   Install or upgrade the Gralkor plugin (default: ${DEFAULT_SOURCE})
  config             Set plugin configuration
  check              Validate prerequisites (uv, API keys, etc.)
  status             Show plugin and server status

Install/config options:
  --config <json>    Plugin config as JSON string
  --set <key=value>  Set individual config value (repeatable)

Install options:
  --dry-run          Show what would happen without executing

General:
  --help             Show this help
  --version          Show CLI version`;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "--help" || command === "-h") {
    console.log(HELP);
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log(`gralkor-cli ${getCLIVersion()}`);
    return;
  }

  switch (command) {
    case "install": {
      const { values, positionals } = parseArgs({
        args: args.slice(1),
        options: {
          config: { type: "string" },
          set: { type: "string", multiple: true },
          "dry-run": { type: "boolean", default: false },
        },
        allowPositionals: true,
      });
      const source = positionals[0];
      if (!source) {
        console.error("Error: install requires a source (tarball path or npm package)");
        console.error("  gralkor install /path/to/susu-eng-gralkor-memory-19.0.4.tgz");
        console.error("  gralkor install @susu-eng/gralkor");
        process.exitCode = 1;
        return;
      }
      await install({
        source,
        config: values.config,
        set: values.set,
        dryRun: values["dry-run"],
      });
      break;
    }
    case "config": {
      const { values: configValues } = parseArgs({
        args: args.slice(1),
        options: {
          config: { type: "string" },
          set: { type: "string", multiple: true },
        },
        allowPositionals: false,
      });
      await config({
        config: configValues.config,
        set: configValues.set,
      });
      break;
    }
    case "check":
      await check();
      break;
    case "status":
      await status();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      console.error("Run 'gralkor --help' for usage");
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
