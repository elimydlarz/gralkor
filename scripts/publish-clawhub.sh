#!/usr/bin/env bash
set -euo pipefail

level="${1:-}"
if [[ -z "$level" || ! "$level" =~ ^(major|minor|patch|current)$ ]]; then
  echo "Usage: pnpm run publish:clawhub -- <major|minor|patch|current>" >&2
  exit 1
fi

# Guard: must be logged in to clawhub before doing any work
if [[ -z "${DRY_RUN:-}" ]]; then
  whoami_cmd="${PUBLISH_CLAWHUB_WHOAMI_CMD:-clawhub whoami}"
  if ! $whoami_cmd >/dev/null 2>&1; then
    echo "Error: not logged in to clawhub. Run 'clawhub login' first." >&2
    exit 1
  fi
fi

# Save pre-bump versions for rollback
old_version=$(node -p "require('./package.json').version")

rollback() {
  echo "Rolling back versions to $old_version..." >&2
  npm version "$old_version" --no-git-tag-version --allow-same-version >/dev/null 2>&1 || true
  node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('openclaw.plugin.json', 'utf8'));
p.version = '$old_version';
fs.writeFileSync('openclaw.plugin.json', JSON.stringify(p, null, 2) + '\n');
" || true
  rm -rf server/wheels
}

if [[ "$level" != "current" ]]; then
  npm version "$level" --no-git-tag-version
fi
version=$(node -p "require('./package.json').version")

# Sync version into openclaw.plugin.json
node -e "
const fs = require('fs');
const p = JSON.parse(fs.readFileSync('openclaw.plugin.json', 'utf8'));
p.version = '$version';
fs.writeFileSync('openclaw.plugin.json', JSON.stringify(p, null, 2) + '\n');
"

if [[ "$level" == "current" ]]; then
  echo "Publishing current version $version (no bump)"
else
  echo "Bumped to $version"
fi

# Build and publish unless DRY_RUN is set (used by tests)
if [[ -z "${DRY_RUN:-}" ]]; then
  build_cmd="${PUBLISH_BUILD_CMD:-pnpm run build}"
  wheel_cmd="${PUBLISH_WHEEL_CMD:-bash scripts/build-arm64-wheel.sh}"
  source_commit="$(git rev-parse HEAD)"

  trap rollback ERR

  $build_cmd
  $wheel_cmd

  if [[ -n "${PUBLISH_PUBLISH_CMD:-}" ]]; then
    $PUBLISH_PUBLISH_CMD
  else
    clawhub package publish . \
      --source-repo elimydlarz/gralkor \
      --source-commit "$source_commit" \
      --source-ref "v${version}"
  fi
  rm -rf server/wheels

  trap - ERR

  git commit --only package.json openclaw.plugin.json -m "$version"
  git tag "v$version"

  echo "Published v$version to ClawHub — tag created locally. Push manually: git push --follow-tags"
fi
