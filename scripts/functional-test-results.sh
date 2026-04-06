#!/usr/bin/env bash
# Extract and display vitest results from functional test log files.
#
# Usage:
#   bash scripts/functional-test-results.sh <log-file> [<log-file> ...]
#   bash scripts/functional-test-results.sh /tmp/gralkor-functional-arm64.log /tmp/gralkor-functional-amd64.log
set -euo pipefail

if [ $# -eq 0 ]; then
  echo "Usage: $0 <log-file> [<log-file> ...]" >&2
  exit 1
fi

strip_ansi() {
  sed 's/\x1b\[[0-9;]*m//g'
}

overall_pass=true

for log in "$@"; do
  if [ ! -f "$log" ]; then
    echo "Log not found: $log" >&2
    continue
  fi

  label=$(basename "$log" .log)
  echo "── $label ──────────────────────────────"

  # Extract vitest test file blocks (lines with ✓/×/↓ and summaries)
  strip_ansi < "$log" | grep -E \
    '^\s+(✓|×|↓|❯)\s|Test Files|^\s+Tests |Duration|healthy after|FAIL  test/|PASS  test/' \
    | grep -v "node_modules" \
    || true

  # Check for overall pass/fail
  if strip_ansi < "$log" | grep -q "Test Files.*failed"; then
    overall_pass=false
    echo ""
    # Show first error
    strip_ansi < "$log" | grep -A3 "Serialized Error\|Error: Command" | head -6 || true
  fi

  echo ""
done

if [ "$overall_pass" = true ]; then
  echo "✓ All functional tests passed"
else
  echo "✗ Some functional tests failed"
  exit 1
fi
