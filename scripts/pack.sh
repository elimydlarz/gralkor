#!/usr/bin/env bash
set -euo pipefail

pnpm run --silent build

version=$(node -p "require('./resources/memory/package.json').version")

cp resources/memory/package.json package.json
cp resources/memory/openclaw.plugin.json openclaw.plugin.json
pnpm pack >/dev/null 2>&1

mv "susu-eng-gralkor-${version}.tgz" "susu-eng-gralkor-memory-${version}.tgz"

echo "susu-eng-gralkor-memory-${version}.tgz"
