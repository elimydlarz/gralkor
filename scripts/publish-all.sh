#!/usr/bin/env bash
set -euo pipefail

level="${1:-}"
if [[ -z "$level" || ! "$level" =~ ^(major|minor|patch|current)$ ]]; then
  echo "Usage: pnpm run publish:all -- <major|minor|patch|current>" >&2
  exit 1
fi

bash scripts/publish-npm.sh "$level"

trap 'echo "npm published OK. Retry ClawHub: pnpm run publish:clawhub -- current" >&2' ERR
bash scripts/publish-clawhub.sh current
trap - ERR
