#!/usr/bin/env bash
set -Eeuo pipefail

level="${1:-}"
if [[ -z "$level" || ! "$level" =~ ^(major|minor|patch|current)$ ]]; then
  echo "Usage: pnpm run publish:ts -- <major|minor|patch|current>" >&2
  exit 1
fi

project_root="$(pwd)"
pkg_file="$project_root/ts/package.json"

# Guard: must be logged in to npm before doing any work
if [[ -z "${DRY_RUN:-}" ]]; then
  whoami_cmd="${PUBLISH_NPM_WHOAMI_CMD:-npm whoami}"
  if ! $whoami_cmd >/dev/null 2>&1; then
    echo "Error: not logged in to npm. Run 'npm login' first." >&2
    exit 1
  fi
fi

old_version=$(node -p "require('$pkg_file').version")

rollback() {
  cd "$project_root"
  echo "Rolling back $pkg_file to $old_version..." >&2
  (cd ts && npm version "$old_version" --no-git-tag-version --allow-same-version >/dev/null 2>&1) || true
}

if [[ "$level" != "current" ]]; then
  (cd ts && npm version "$level" --no-git-tag-version)
fi
version=$(node -p "require('$pkg_file').version")

if [[ "$level" == "current" ]]; then
  echo "Publishing current npm version $version (no bump)"
else
  echo "Bumped $pkg_file to $version"
fi

if [[ -z "${DRY_RUN:-}" ]]; then
  build_cmd="${PUBLISH_TS_BUILD_CMD:-pnpm --filter @susu-eng/gralkor-ts run build}"
  publish_cmd="${PUBLISH_TS_PUBLISH_CMD:-pnpm publish --access public --no-git-checks}"

  [[ "$level" != "current" ]] && trap rollback ERR

  $build_cmd
  (cd ts && $publish_cmd)

  [[ "$level" != "current" ]] && trap - ERR

  if [[ "$level" != "current" ]]; then
    git commit --only "$pkg_file" -m "gralkor-ts-v$version" || \
      git diff --quiet HEAD -- "$pkg_file"
  fi
  if git rev-parse "gralkor-ts-v$version" >/dev/null 2>&1; then
    echo "Tag gralkor-ts-v$version already exists — skipping"
  else
    git tag "gralkor-ts-v$version"
  fi

  echo "Published gralkor-ts-v$version to npm — tag created locally. Push manually: git push --follow-tags"
fi
