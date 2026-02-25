#!/usr/bin/env bash
set -euo pipefail

pnpm run --silent build

version=$(node -p "require('./resources/memory/package.json').version")
tarballs=()

for mode in memory tool; do
  cp resources/$mode/package.json package.json
  cp resources/$mode/openclaw.plugin.json openclaw.plugin.json
  pnpm pack --silent

  # pnpm produces openclaw-gralkor-<version>.tgz for both modes (same package name).
  # Rename to mode-specific tarball so the second pack doesn't overwrite the first.
  mv "openclaw-gralkor-${version}.tgz" "openclaw-gralkor-${mode}-${version}.tgz"
  tarballs+=("openclaw-gralkor-${mode}-${version}.tgz")
done

# Restore canonical (memory) state
cp resources/memory/package.json package.json
cp resources/memory/openclaw.plugin.json openclaw.plugin.json

printf '%s\n' "${tarballs[@]}"
