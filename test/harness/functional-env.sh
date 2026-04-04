#!/usr/bin/env bash
# Manage the functional test environment (long-lived container for iterative test runs).
#
# Usage:
#   bash test/harness/functional-env.sh up               # build image + start env
#   bash test/harness/functional-env.sh down             # stop + remove container
#   bash test/harness/functional-env.sh run [pattern]    # run functional tests (optional vitest filter)
#   bash test/harness/functional-env.sh shell            # interactive bash in the container
#
# Environment:
#   GEMINI_API_KEY / GOOGLE_API_KEY  — passed to container at 'up' time
#   PLATFORM                         — docker platform (default: linux/arm64)
#   GRALKOR_FUNC_CONTAINER           — container name (default: gralkor-functional)
#
# Examples:
#   bash test/harness/functional-env.sh up
#   bash test/harness/functional-env.sh run native-indexing
#   bash test/harness/functional-env.sh shell
#   bash test/harness/functional-env.sh down
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
    # Print a dot every 15s so the user knows we're still waiting
    [ $((i % 15)) -eq 0 ] && echo "  ...${i}s elapsed"
    sleep 1
  done
  echo ""
  echo "ERROR: server did not become healthy within ${timeout}s" >&2
  echo "--- Container logs (last 40 lines) ---" >&2
  docker logs --tail 40 "$CONTAINER" >&2
  return 1
}

# ── Commands ─────────────────────────────────────────────────────────────────

cmd_up() {
  local rebuild=true
  local build_args=()
  for arg in "$@"; do
    if [ "$arg" = "--no-rebuild" ]; then
      rebuild=false
    else
      build_args+=("$arg")
    fi
  done

  if [ "$rebuild" = true ]; then
    echo "=== Building harness image ==="
    bash "$REPO_ROOT/test/harness/build.sh" "${build_args[@]+"${build_args[@]}"}"
  else
    echo "=== Skipping image build (--no-rebuild) ==="
    if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
      echo "ERROR: image '$IMAGE' not found — run without --no-rebuild first." >&2
      exit 1
    fi
  fi

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
    "${KEY_ARGS[@]}" \
    "$IMAGE" \
    bash -c "
      # Configure API key if available
      if [ -n \"\$GEMINI_API_KEY\" ]; then
        openclaw config set plugins.entries.gralkor.config.googleApiKey \"\$GEMINI_API_KEY\" >/dev/null 2>&1
      fi

      # Seed workspace files
      mkdir -p \$HOME/.openclaw/workspace/memory
      printf '# About Me\nMy favourite number is 23.\n' \
        > \$HOME/.openclaw/workspace/MEMORY.md
      printf '# Session Notes\nMy lucky number is 47.\n' \
        > \$HOME/.openclaw/workspace/memory/session-001.md

      # Start gateway (triggers server + native indexer)
      openclaw gateway &

      # Keep alive
      tail -f /dev/null
    "

  wait_healthy

  echo ""
  echo "Functional env is ready."
  echo ""
  echo "Available tests:"
  docker exec "$CONTAINER" bash -c \
    "cd /app/gralkor-src && pnpm exec vitest list --config test/functional/vitest.config.ts 2>/dev/null" \
    | sed 's/^/  /'
  echo ""
  echo "  Run all:     bash test/harness/functional-env.sh run"
  echo "  Run filter:  bash test/harness/functional-env.sh run <pattern>"
  echo "  Shell:       bash test/harness/functional-env.sh shell"
  echo "  Stop:        bash test/harness/functional-env.sh down"
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

cmd_run() {
  if ! is_running; then
    echo "ERROR: container '$CONTAINER' is not running. Start it with:" >&2
    echo "  bash test/harness/functional-env.sh up" >&2
    exit 1
  fi

  FILTER="${1:-}"
  if [ -n "$FILTER" ]; then
    docker exec "$CONTAINER" bash -c \
      "cd /app/gralkor-src && pnpm run test:functional -- --reporter=verbose -t '$FILTER'"
  else
    docker exec "$CONTAINER" bash -c \
      "cd /app/gralkor-src && pnpm run test:functional"
  fi
}

cmd_shell() {
  if ! is_running; then
    echo "ERROR: container '$CONTAINER' is not running. Start it with:" >&2
    echo "  bash test/harness/functional-env.sh up" >&2
    exit 1
  fi
  docker exec -it "$CONTAINER" bash
}

cmd_help() {
  sed -n '2,20p' "$0" | grep '^#' | sed 's/^# \?//'
}

# ── Dispatch ─────────────────────────────────────────────────────────────────

case "$cmd" in
  up)    cmd_up "$@" ;;
  down)  cmd_down ;;
  run)   cmd_run "$@" ;;
  shell) cmd_shell ;;
  help|--help|-h) cmd_help ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo "Usage: $0 {up|down|run|shell}" >&2
    exit 1
    ;;
esac
