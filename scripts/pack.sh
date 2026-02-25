#!/usr/bin/env bash
set -euo pipefail

pnpm run build

for mode in memory tool; do
  cp resources/$mode/package.json package.json
  cp resources/$mode/openclaw.plugin.json openclaw.plugin.json
  npm pack
done

# Restore canonical (memory) state
cp resources/memory/package.json package.json
cp resources/memory/openclaw.plugin.json openclaw.plugin.json
