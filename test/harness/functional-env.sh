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
#   GOOGLE_API_KEY  — passed to container at 'up' time (auto-loaded from .env if unset)
#   PLATFORM                         — docker platform (default: linux/arm64)
#   GRALKOR_FUNC_CONTAINER           — container name (default: gralkor-functional)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

# Auto-load .env (repo root) if GOOGLE_API_KEY is not already set.
if [ -z "${GOOGLE_API_KEY:-}" ] && [ -f "$REPO_ROOT/.env" ]; then
  GOOGLE_API_KEY="$(grep -v '^\s*#' "$REPO_ROOT/.env" | grep '^GOOGLE_API_KEY=' | head -1 | cut -d= -f2-)"
  export GOOGLE_API_KEY
fi
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

  # Phase 1: wait for gateway WebSocket (fast — typically < 30s)
  echo "Waiting for gateway readiness (up to 60s)..."
  local gw_ready=false
  for i in $(seq 1 60); do
    docker exec "$CONTAINER" openclaw health >/dev/null 2>&1 && {
      echo "  Gateway ready after ${i}s"
      gw_ready=true
      break
    }
    sleep 1
  done
  if [ "$gw_ready" = false ]; then
    echo "ERROR: gateway did not become ready within 60s" >&2
    docker logs --tail 40 "$CONTAINER" >&2
    return 1
  fi

  # Phase 2: wait for gralkor server health (slow — first boot may take 2-4 min)
  echo "Waiting for gralkor server health (up to ${timeout}s, first boot may take 2-4 min)..."
  for i in $(seq 1 "$timeout"); do
    HEALTH=$(docker exec "$CONTAINER" curl -s http://127.0.0.1:8001/health 2>/dev/null) && {
      echo "  Server healthy after ${i}s"
      return 0
    }
    [ $((i % 15)) -eq 0 ] && echo "  ...${i}s elapsed"
    sleep 1
  done
  echo ""
  echo "ERROR: gralkor server did not become healthy within ${timeout}s" >&2
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

  KEY_ARGS=()
  [ -n "${GOOGLE_API_KEY:-}" ] && KEY_ARGS+=(-e "GOOGLE_API_KEY=$GOOGLE_API_KEY")

  echo ""
  echo "=== Starting functional env container ==="
  docker run -d \
    --name "$CONTAINER" \
    --platform "$PLATFORM" \
    -v "$REPO_ROOT/test/functional:/app/gralkor-src/test/functional:ro" \
    "${KEY_ARGS[@]+"${KEY_ARGS[@]}"}" \
    "$IMAGE" \
    bash -c "
      if [ -n \"\$GOOGLE_API_KEY\" ]; then
        openclaw config set plugins.entries.gralkor.config.googleApiKey \"\$GOOGLE_API_KEY\" >/dev/null 2>&1
      fi

      # Short idle timeout so the debounce-flush fires quickly in tests (default is 5 min).
      openclaw config set plugins.entries.gralkor.config.idleTimeoutMs 10000 >/dev/null 2>&1

      # Provide Google auth profile and pin the agent to a current Gemini
      # model (the OpenClaw default is Anthropic, but the harness only has a
      # Google key). Keep this in sync with the model used in production.
      if [ -n "\$GOOGLE_API_KEY" ]; then
        mkdir -p \$HOME/.openclaw/agents/main/agent
        printf '{"google:manual":{"provider":"google","type":"api-key","apiKey":"%s"}}' "\$GOOGLE_API_KEY" \
          > \$HOME/.openclaw/agents/main/agent/auth-profiles.json
        openclaw models set google/gemini-3.1-flash-lite-preview >/dev/null 2>&1
      fi

      # Seed workspace files before gateway start.
      # Native indexer runs on first session start and indexes these to the agent's group.
      mkdir -p \$HOME/.openclaw/workspace/memory
      printf '# Session Notes\nEli has the lucky number LuckyNumber47.\n' \
        > \$HOME/.openclaw/workspace/memory/session-001.md

      # Start gateway (triggers server + native indexer).
      # NOTE: must come BEFORE 'openclaw agents add', because agents add talks
      # to the gateway during creation and blocks indefinitely without it.
      openclaw gateway &

      tail -f /dev/null
    "

  wait_healthy

  # Approve any pending CLI device pairings so `openclaw agent` can talk to
  # the gateway. Without this, the CLI's first connect attempt is rejected
  # with "pairing required" and it falls back to embedded mode — which works
  # for the agent run itself but leaves the CLI process hanging post-run.
  echo "Approving CLI device pairings..."
  docker exec "$CONTAINER" bash -c '
    pending_ids=$(openclaw devices list 2>/dev/null \
      | awk "/^Pending/ {flag=1; next} /^Paired/ {flag=0} flag" \
      | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    for id in $pending_ids; do
      openclaw devices approve "$id" >/dev/null 2>&1 && echo "  approved $id"
    done
    # Trigger a CLI handshake to enroll the local device, then approve again
    # in case approval generated a new pending request.
    openclaw config get gateway.mode >/dev/null 2>&1 || true
    pending_ids=$(openclaw devices list 2>/dev/null \
      | awk "/^Pending/ {flag=1; next} /^Paired/ {flag=0} flag" \
      | grep -oE "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
    for id in $pending_ids; do
      openclaw devices approve "$id" >/dev/null 2>&1 && echo "  approved $id"
    done
  '

  # Create the hyphenated-ID agent for the sanitization test. Must run after
  # the gateway is healthy and the CLI is paired, because 'agents add' talks
  # to the gateway during creation.  Note: --json causes docker exec to hang
  # (the CLI keeps a gateway connection open for structured output), so we
  # omit it.
  echo "Adding test agents..."
  docker exec "$CONTAINER" openclaw agents add my-hyphen-agent \
    --workspace "/root/.openclaw/workspace" --non-interactive >/dev/null 2>&1 \
    && echo "  added my-hyphen-agent" \
    || echo "  WARN: failed to add my-hyphen-agent"

  echo ""
  echo "Functional env ready. Run: bash test/harness/functional-env.sh run"
}

cmd_run() {
  if ! is_running; then
    echo "ERROR: container '$CONTAINER' is not running. Start it with:" >&2
    echo "  bash test/harness/functional-env.sh up" >&2
    exit 1
  fi
  # Run vitest directly (not via pnpm exec) so that pnpm does not prepend
  # node_modules/.bin to PATH — tests must resolve 'openclaw' to the version
  # installed globally in the container, not whatever pnpm resolved as a peer dep.
  docker exec "$CONTAINER" bash -c \
    "cd /app/gralkor-src && node_modules/.bin/vitest run --config test/functional/vitest.config.ts"
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
  cmd_down
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
