#!/usr/bin/env bash
# Build the harness Docker image with the current plugin code.
# Usage: bash test/harness/build.sh [--no-cache]
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS_DIR="$REPO_ROOT/test/harness"

echo "=== Building plugin tarball ==="
cd "$REPO_ROOT"

# Build TypeScript
pnpm run --silent build

# Pack without the arm64 wheel build (we're testing install, not prod deploy).
# Use resources/memory manifests like pack.sh does.
cp resources/memory/package.json package.json
cp resources/memory/openclaw.plugin.json openclaw.plugin.json
pnpm pack --pack-destination "$HARNESS_DIR" >/dev/null 2>&1

# Restore dev package.json
git checkout package.json openclaw.plugin.json 2>/dev/null || true

# Rename to stable name the Dockerfile expects
VERSION=$(node -p "require('./resources/memory/package.json').version")
mv "$HARNESS_DIR/susu-eng-gralkor-${VERSION}.tgz" "$HARNESS_DIR/plugin.tgz"

echo "Plugin tarball: test/harness/plugin.tgz"
echo ""

echo "=== Building Docker image ==="
docker build "$@" -t gralkor-harness:latest "$HARNESS_DIR"

echo ""
echo "=== Done. Run with: ==="
echo "  docker run --rm -it gralkor-harness:latest"
echo "  docker run --rm -it gralkor-harness:latest bash   # interactive shell"
