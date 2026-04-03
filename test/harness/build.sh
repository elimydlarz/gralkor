#!/usr/bin/env bash
# Build the harness Docker image with the current plugin code.
#
# Usage:
#   bash test/harness/build.sh              # local tarball on linux/arm64 (matches Mac operators)
#   bash test/harness/build.sh --npm        # from npm (test what operators get)
#   bash test/harness/build.sh --no-cache   # rebuild without Docker cache
#
# linux/arm64 by default — matches macOS Apple Silicon and Hetzner CAX31.
# Override: PLATFORM=linux/amd64 bash test/harness/build.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS_DIR="$REPO_ROOT/test/harness"

FROM_NPM=false
DOCKER_ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--npm" ]; then
    FROM_NPM=true
  else
    DOCKER_ARGS+=("$arg")
  fi
done

if [ "$FROM_NPM" = true ]; then
  echo "=== Installing from npm (operator flow) ==="
  # Still need a dummy plugin.tgz for COPY directive
  touch "$HARNESS_DIR/plugin.tgz"
  DOCKER_ARGS+=(--build-arg "PLUGIN_SOURCE=@susu-eng/gralkor")
else
  echo "=== Building plugin tarball from local source ==="
  cd "$REPO_ROOT"

  pnpm run --silent build

  # Build the arm64 wheel (same as make pack) — skip if already present
  if ls server/wheels/falkordblite-*.whl >/dev/null 2>&1; then
    echo "Using existing arm64 wheel: $(ls server/wheels/*.whl)"
  else
    bash scripts/build-arm64-wheel.sh
  fi

  # Pack with resources/memory manifests
  cp resources/memory/package.json package.json
  cp resources/memory/openclaw.plugin.json openclaw.plugin.json
  pnpm pack --pack-destination "$HARNESS_DIR" >/dev/null 2>&1

  # Clean up wheels from repo (they're in the tarball now)
  rm -rf server/wheels

  # Restore dev manifests
  git checkout package.json openclaw.plugin.json 2>/dev/null || true

  VERSION=$(node -p "require('./resources/memory/package.json').version")
  mv "$HARNESS_DIR/susu-eng-gralkor-${VERSION}.tgz" "$HARNESS_DIR/plugin.tgz"

  echo "Plugin tarball: test/harness/plugin.tgz"
fi

PLATFORM="${PLATFORM:-linux/arm64}"

echo ""
echo "=== Building Docker image (platform: $PLATFORM) ==="
docker build --platform "$PLATFORM" ${DOCKER_ARGS[@]+"${DOCKER_ARGS[@]}"} -t gralkor-harness:latest "$HARNESS_DIR"

# Clean up tarball
rm -f "$HARNESS_DIR/plugin.tgz"

echo ""
echo "=== Done (platform: $PLATFORM) ==="
echo "  docker run --rm -it --platform $PLATFORM gralkor-harness:latest          # run test script"
echo "  docker run --rm -it --platform $PLATFORM gralkor-harness:latest bash      # interactive shell"
