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

  [[ "$level" != "current" ]] && trap rollback ERR

  $build_cmd
  $wheel_cmd

  # Upload the arm64 wheel to GitHub Releases so server-manager.ts can fetch
  # it on first start (the wheel is 24 MB > ClawHub's 20 MB upload limit, so
  # it isn't bundled in the ClawHub package).
  if [[ -z "${PUBLISH_SKIP_GH_RELEASE:-}" ]]; then
    wheel_file=$(ls server/wheels/*.whl 2>/dev/null | head -n1 || true)
    if [[ -z "$wheel_file" ]]; then
      echo "Error: no wheel found in server/wheels/ after build" >&2
      exit 1
    fi
    tag="v${version}"
    if ! gh release view "$tag" >/dev/null 2>&1; then
      gh release create "$tag" --title "$tag" --notes "Release $tag"
    fi
    gh release upload "$tag" "$wheel_file" --clobber
  fi

  clawhub_log=$(mktemp)
  set +e
  clawhub_publish_cmd="${PUBLISH_CLAWHUB_PUBLISH_CMD:-${PUBLISH_PUBLISH_CMD:-}}"
  if [[ -n "$clawhub_publish_cmd" ]]; then
    $clawhub_publish_cmd 2>&1 | tee "$clawhub_log"
  else
    clawhub package publish . \
      --source-repo elimydlarz/gralkor \
      --source-commit "$source_commit" \
      --source-ref "v${version}" 2>&1 | tee "$clawhub_log"
  fi
  publish_failed=${PIPESTATUS[0]}
  set -e
  if [[ $publish_failed -ne 0 ]]; then
    echo "" >&2
    echo "=== clawhub publish failed (exit $publish_failed) — full output ===" >&2
    cat "$clawhub_log" >&2
    echo "=================================================================" >&2
    rm -f "$clawhub_log"
    exit $publish_failed
  fi
  rm -f "$clawhub_log"
  rm -rf server/wheels

  trap - ERR

  if [[ "$level" == "current" ]]; then
    git commit --allow-empty -m "$version"
  else
    git commit --only package.json openclaw.plugin.json -m "$version"
  fi
  if git rev-parse "v$version" >/dev/null 2>&1; then
    echo "Tag v$version already exists — skipping"
  else
    git tag "v$version"
  fi

  echo "Published v$version to ClawHub — tag created locally. Push manually: git push --follow-tags"
fi
