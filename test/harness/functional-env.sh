#!/usr/bin/env bash
# Manage the functional test environment.
#
# Usage:
#   bash test/harness/functional-env.sh up     # build image + start env
#   bash test/harness/functional-env.sh run    # run journey functional test
#   bash test/harness/functional-env.sh down   # stop + remove container
#   bash test/harness/functional-env.sh test   # up + run + down
#
# Environment:
#   GEMINI_API_KEY / GOOGLE_API_KEY  — passed to container at 'up' time
#   PLATFORM                         — docker platform (default: linux/arm64)
#   GRALKOR_FUNC_CONTAINER           — container name (default: gralkor-functional)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLATFORM="${PLATFORM:-linux/arm64}"
CONTAINER="${GRALKOR_FUNC_CONTAINER:-gralkor-functional}"
IMAGE="gralkor-harness:latest"

cmd="${1:-help}"
shift || true

# ── Helpers ─────────────────────────────────────────────────────────────────

is_running() {
  docker inspect --format '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true
}

is_created() {
  docker inspect "$CONTAINER" >/dev/null 2>&1
}

wait_healthy() {
  local timeout="${1:-300}"
  echo "Waiting for server health (up to ${timeout}s, first boot may take 2-4 min)..."
  for i in $(seq 1 "$timeout"); do
    HEALTH=$(docker exec "$CONTAINER" curl -s http://127.0.0.1:8001/health 2>/dev/null) && {
      echo "  Server healthy after ${i}s"
      return 0
    }
    [ $((i % 15)) -eq 0 ] && echo "  ...${i}s elapsed"
    sleep 1
  done
  echo ""
  echo "ERROR: server did not become healthy within ${timeout}s" >&2
  docker logs --tail 40 "$CONTAINER" >&2
  return 1
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd_up() {
  echo "=== Building harness image ==="
  bash "$REPO_ROOT/test/harness/build.sh"

  if is_running; then
    echo "Container '$CONTAINER' already running — use 'down' first to restart."
    return 0
  fi

  if is_created; then
    echo "Removing stopped container '$CONTAINER'..."
    docker rm "$CONTAINER" >/dev/null
  fi

  API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
  KEY_ARGS=()
  [ -n "$API_KEY" ] && KEY_ARGS+=(-e "GEMINI_API_KEY=$API_KEY")

  echo ""
  echo "=== Starting functional env container ==="
  docker run -d \
    --name "$CONTAINER" \
    --platform "$PLATFORM" \
    -v "$REPO_ROOT/test/functional:/app/gralkor-src/test/functional:ro" \
    "${KEY_ARGS[@]}" \
    "$IMAGE" \
    bash -c "
      if [ -n \"\$GEMINI_API_KEY\" ]; then
        openclaw config set plugins.entries.gralkor.config.googleApiKey \"\$GEMINI_API_KEY\" >/dev/null 2>&1
      fi

      # Seed workspace files before gateway start (native indexer reads these at boot)
      mkdir -p \$HOME/.openclaw/workspace/memory
      printf '# About Me\nMy name is Harness User and I live in Test City. My favourite number is 23.\n' \
        > \$HOME/.openclaw/workspace/MEMORY.md
      printf '# Session Notes\nHarness User has lucky number 47.\n' \
        > \$HOME/.openclaw/workspace/memory/session-001.md

      # Start gateway (triggers server + native indexer)
      openclaw gateway &

      tail -f /dev/null
    "

  wait_healthy
  echo ""
  echo "Functional env ready. Run: bash test/harness/functional-env.sh run"
}

cmd_run() {
  if ! is_running; then
    echo "ERROR: container '$CONTAINER' is not running. Start it with:" >&2
    echo "  bash test/harness/functional-env.sh up" >&2
    exit 1
  fi
  docker exec "$CONTAINER" bash -c \
    "cd /app/gralkor-src && pnpm exec vitest run --config test/functional/vitest.config.ts"
}

cmd_down() {
  if is_created; then
    echo "Stopping and removing container '$CONTAINER'..."
    docker rm -f "$CONTAINER" >/dev/null
    echo "Done."
  else
    echo "Container '$CONTAINER' not found — nothing to do."
  fi
}

cmd_test() {
  cmd_up
  cmd_run
  cmd_down
}

cmd_help() {
  sed -n '2,10p' "$0" | grep '^#' | sed 's/^# \?//'
}

# ── Dispatch ─────────────────────────────────────────────────────────────────

case "$cmd" in
  up)   cmd_up ;;
  run)  cmd_run ;;
  down) cmd_down ;;
  test) cmd_test ;;
  help|--help|-h) cmd_help ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Usage: $0 {up|run|down|test}" >&2
    exit 1
    ;;
esac
