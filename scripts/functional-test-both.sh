#!/usr/bin/env bash
# Run functional tests on both linux/arm64 and linux/amd64.
#
# Usage:
#   bash scripts/functional-test-both.sh
#   GOOGLE_API_KEY=... bash scripts/functional-test-both.sh
#
# Output files:
#   /tmp/gralkor-functional-arm64.log
#   /tmp/gralkor-functional-amd64.log
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARM64_LOG=/tmp/gralkor-functional-arm64.log
AMD64_LOG=/tmp/gralkor-functional-amd64.log

echo "=== ARM64 ==="
PLATFORM=linux/arm64 \
  GRALKOR_FUNC_CONTAINER=gralkor-functional-arm64 \
  bash "$REPO_ROOT/test/harness/functional-env.sh" test 2>&1 | tee "$ARM64_LOG"

echo ""
echo "=== AMD64 ==="
PLATFORM=linux/amd64 \
  GRALKOR_FUNC_CONTAINER=gralkor-functional-amd64 \
  bash "$REPO_ROOT/test/harness/functional-env.sh" test 2>&1 | tee "$AMD64_LOG"

echo ""
echo "=== Summary ==="
bash "$REPO_ROOT/scripts/functional-test-results.sh" "$ARM64_LOG" "$AMD64_LOG"
