#!/usr/bin/env bash
set -euo pipefail

level="${1:-}"
if [[ -z "$level" || ! "$level" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: pnpm run publish:npm -- <major|minor|patch>" >&2
  exit 1
fi

# Save pre-bump versions for rollback
manifests=("openclaw.plugin.json" "resources/memory/package.json")
old_version=$(node -p "require('./package.json').version")

rollback() {
  echo "Rolling back versions to $old_version..." >&2
  # Restore package.json
  npm version "$old_version" --no-git-tag-version --allow-same-version >/dev/null 2>&1 || true
  # Restore other manifests
  node -e "
const fs = require('fs');
['openclaw.plugin.json', 'resources/memory/package.json'].forEach(f => {
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  p.version = '$old_version';
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
});
" || true
  rm -rf server/wheels
}

npm version "$level" --no-git-tag-version
version=$(node -p "require('./package.json').version")

# Sync version into openclaw.plugin.json and resources/memory/package.json
node -e "
const fs = require('fs');
['openclaw.plugin.json', 'resources/memory/package.json'].forEach(f => {
  const p = JSON.parse(fs.readFileSync(f, 'utf8'));
  p.version = '$version';
  fs.writeFileSync(f, JSON.stringify(p, null, 2) + '\n');
});
"

echo "Bumped to $version"

# Build and publish unless DRY_RUN is set (used by tests)
if [[ -z "${DRY_RUN:-}" ]]; then
  # Allow overriding commands for testing
  build_cmd="${PUBLISH_BUILD_CMD:-pnpm run build}"
  publish_cmd="${PUBLISH_PUBLISH_CMD:-pnpm publish --access public --no-git-checks}"

  trap rollback ERR

  $build_cmd
  $publish_cmd

  trap - ERR

  git commit --only package.json openclaw.plugin.json resources/memory/package.json -m "$version"
  git tag "v$version"

  push_cmd="${PUBLISH_GIT_PUSH_CMD:-git push --follow-tags}"
  $push_cmd
  echo "Published and pushed v$version"
fi
