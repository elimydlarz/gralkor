#!/usr/bin/env bash
set -euo pipefail

level="${1:-}"
if [[ -z "$level" || ! "$level" =~ ^(major|minor|patch)$ ]]; then
  echo "Usage: pnpm run publish:npm -- <major|minor|patch>" >&2
  exit 1
fi

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
  pnpm run build
  pnpm publish --access public

  git commit --only package.json openclaw.plugin.json resources/memory/package.json -m "$version"
  git tag "v$version"
  echo "Tagged v$version — run 'git push --follow-tags' to push"
fi
