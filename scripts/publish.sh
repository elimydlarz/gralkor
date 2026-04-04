#!/usr/bin/env bash
set -euo pipefail

level="${1:-}"
if [[ -z "$level" || ! "$level" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: pnpm run publish:npm -- <major|minor|patch>" >&2
  exit 1
fi

# Guard: must be logged in to npm before doing any work
if [[ -z "${DRY_RUN:-}" ]]; then
  whoami_cmd="${PUBLISH_NPM_WHOAMI_CMD:-npm whoami}"
  if ! $whoami_cmd >/dev/null 2>&1; then
    echo "Error: not logged in to npm. Run 'npm login' first." >&2
    exit 1
  fi
fi

# Save pre-bump versions for rollback
old_version=$(node -p "require('./package.json').version")

rollback() {
  echo "Rolling back versions to $old_version..." >&2
  # Restore package.json
  npm version "$old_version" --no-git-tag-version --allow-same-version >/dev/null 2>&1 || true
  # Restore openclaw.plugin.json
  node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('openclaw.plugin.json', 'utf8'));
p.version = '$old_version';
fs.writeFileSync('openclaw.plugin.json', JSON.stringify(p, null, 2) + '\n');
" || true
  rm -rf server/wheels
}

npm version "$level" --no-git-tag-version
version=$(node -p "require('./package.json').version")

# Sync version into openclaw.plugin.json
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('openclaw.plugin.json', 'utf8'));
p.version = '$version';
fs.writeFileSync('openclaw.plugin.json', JSON.stringify(p, null, 2) + '\n');
"

echo "Bumped to $version"

# Build and publish unless DRY_RUN is set (used by tests)
if [[ -z "${DRY_RUN:-}" ]]; then
  # Allow overriding commands for testing
  build_cmd="${PUBLISH_BUILD_CMD:-pnpm run build}"
  publish_cmd="${PUBLISH_PUBLISH_CMD:-pnpm publish --access public --no-git-checks}"

  trap rollback ERR

  $build_cmd
  wheel_cmd="${PUBLISH_WHEEL_CMD:-bash scripts/build-arm64-wheel.sh}"
  $wheel_cmd
  $publish_cmd
  rm -rf server/wheels

  trap - ERR

  git commit --only package.json openclaw.plugin.json -m "$version"
  git tag "v$version"

  echo "Published v$version — tag created locally. Push manually: git push --follow-tags"
fi
