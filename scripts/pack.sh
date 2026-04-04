#!/usr/bin/env bash
set -euo pipefail

pnpm run --silent build

version=$(node -p "require('./package.json').version")

bash scripts/build-arm64-wheel.sh

pnpm pack >/dev/null 2>&1

rm -rf server/wheels

mv "susu-eng-gralkor-${version}.tgz" "susu-eng-gralkor-memory-${version}.tgz"

echo "susu-eng-gralkor-memory-${version}.tgz"
