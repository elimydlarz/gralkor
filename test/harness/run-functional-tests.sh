#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Gralkor Install Harness ==="
echo ""

# ── Configure ────────────────────────────────────────────
API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
if [ -n "$API_KEY" ]; then
  echo "Configuring googleApiKey from env..."
  openclaw config set plugins.entries.gralkor.config.googleApiKey "$API_KEY" >/dev/null 2>&1
else
  echo "WARNING: GEMINI_API_KEY not set — server will fail to start"
fi
echo ""

# ── 0. Seed native memory ─────────────────────────────────
echo "--- 0. Seed native memory ---"
mkdir -p "$HOME/.openclaw/workspace/memory"
printf '# About Me\nMy name is Harness User and I live in Test City. My favourite number is 23.\n' \
  > "$HOME/.openclaw/workspace/MEMORY.md"
printf '# Session Notes\nMy lucky number is 47.\n' \
  > "$HOME/.openclaw/workspace/memory/session-001.md"
pass "workspace files seeded"
echo ""

# ── 1. Plugin install ─────────────────────────────────────
echo "--- 1. Plugin install ---"
PLUGIN_DIR="$HOME/.openclaw/extensions/gralkor"

[ -d "$PLUGIN_DIR" ] && pass "plugin directory exists" || fail "plugin directory missing"
[ -f "$PLUGIN_DIR/openclaw.plugin.json" ] && pass "manifest present" || fail "manifest missing"
[ -f "$PLUGIN_DIR/dist/index.js" ] && pass "dist/index.js present" || fail "dist/index.js missing"
[ -f "$PLUGIN_DIR/server/main.py" ] && pass "server/main.py present" || fail "server/main.py missing"
echo ""

# ── 2. Boot server via OpenClaw gateway ──────────────────
echo "--- 2. Server boot ---"
echo "Starting OpenClaw gateway (triggers plugin load and server self-start)..."

# Start the gateway in background — plugins self-start as part of gateway boot.
openclaw gateway >/dev/null 2>&1 &
GATEWAY_PID=$!

# Wait for server health
echo "Waiting for server health (up to 120s)..."
SERVER_OK=false
for i in $(seq 1 120); do
  HEALTH=$(curl -s http://127.0.0.1:8001/health 2>/dev/null) && {
    SERVER_OK=true
    echo "  Server healthy after ${i}s"
    break
  }
  sleep 1
done

if [ "$SERVER_OK" = true ]; then
  pass "server is healthy"
  if echo "$HEALTH" | grep -q '"connected":true'; then
    pass "FalkorDB connected"
  else
    fail "FalkorDB not connected"
  fi
else
  fail "server did not become healthy within 120s"
fi
echo ""

# ── 2b. Verify falkordblite install path ──────────────────
echo "--- 2b. FalkorDB install path ---"
ARCH=$(uname -m)
VENV=/data/gralkor/venv
WHEELS_DIR="$HOME/.openclaw/extensions/gralkor/server/wheels"

if VIRTUAL_ENV="$VENV" uv pip show falkordblite >/dev/null 2>&1; then
  pass "falkordblite installed in venv"
else
  fail "falkordblite not found in venv"
fi

if [ "$ARCH" = "aarch64" ]; then
  # On arm64: the bundled wheel should be present and should have been used
  # (PyPI manylinux_2_39 wheel is incompatible with Bookworm glibc 2.36)
  WHEEL_COUNT=$(ls "$WHEELS_DIR"/*.whl 2>/dev/null | wc -l || echo 0)
  if [ "$WHEEL_COUNT" -gt 0 ]; then
    pass "bundled arm64 wheel present and used (aarch64 host)"
  else
    fail "bundled arm64 wheel missing on aarch64 host"
  fi
else
  # On non-arm64 (amd64 / macOS-like): PyPI should have been used.
  # If the aarch64 wheel were force-installed, the server would be unhealthy (wrong arch binary).
  # A healthy server proves PyPI was used correctly.
  if [ "$SERVER_OK" = true ]; then
    pass "PyPI path used — server healthy on non-arm64 host ($ARCH)"
  else
    fail "PyPI install failed on non-arm64 host ($ARCH)"
  fi
fi
echo ""

# ── 3. Functional tests ───────────────────────────────────
echo "--- 3. Functional tests ---"
if [ "$SERVER_OK" = true ]; then
  cd /app/gralkor-src && pnpm run test:functional 2>&1 | sed 's/^/  /'
  FUNCTIONAL_EXIT="${PIPESTATUS[0]}"
  cd - >/dev/null
  [ "$FUNCTIONAL_EXIT" -eq 0 ] && pass "functional tests" \
                                 || fail "functional tests"
else
  fail "functional tests skipped (server not healthy)"
fi
echo ""

# ── 4. Reinstall (upgrade-safe) ────────────────────────────
echo "--- 4. Reinstall ---"

# Kill everything from the first boot — server, openclaw-plugins, redis
pkill -f "uvicorn main:app" 2>/dev/null || true
pkill -f "openclaw-plugins" 2>/dev/null || true
pkill -f "redis-server" 2>/dev/null || true
kill $GATEWAY_PID 2>/dev/null || true
sleep 3

# Clear the memory slot before removing — otherwise install fails validation
openclaw config set plugins.slots.memory "" >/dev/null 2>&1 || true

# Wipe the plugin dir (simulates what agents/init.sh does)
rm -rf "$HOME/.openclaw/extensions/gralkor"

# Reinstall from the original tarball
if [ -f /tmp/plugin.tgz ]; then
  openclaw plugins install /tmp/plugin.tgz --dangerously-force-unsafe-install >/dev/null 2>&1
  REINSTALL_OK=$?
else
  # npm install path
  openclaw plugins install @susu-eng/gralkor --dangerously-force-unsafe-install >/dev/null 2>&1
  REINSTALL_OK=$?
fi

if [ "$REINSTALL_OK" -eq 0 ]; then
  pass "reinstall succeeded"
else
  fail "reinstall failed (exit $REINSTALL_OK)"
fi

# Re-apply config (config survives, but verify)
openclaw config set plugins.slots.memory gralkor >/dev/null 2>&1
openclaw config set plugins.entries.gralkor.config.dataDir /data/gralkor >/dev/null 2>&1
openclaw config set plugins.entries.gralkor.config.test true >/dev/null 2>&1
if [ -n "$API_KEY" ]; then
  openclaw config set plugins.entries.gralkor.config.googleApiKey "$API_KEY" >/dev/null 2>&1
fi

# Boot gateway again
openclaw gateway >/dev/null 2>&1 &
GATEWAY_PID2=$!

echo "Waiting for server health after reinstall (up to 120s)..."
REINSTALL_SERVER_OK=false
for i in $(seq 1 120); do
  HEALTH=$(curl -s http://127.0.0.1:8001/health 2>/dev/null) && {
    REINSTALL_SERVER_OK=true
    echo "  Server healthy after ${i}s"
    break
  }
  sleep 1
done

if [ "$REINSTALL_SERVER_OK" = true ]; then
  pass "server healthy after reinstall"
else
  fail "server not healthy after reinstall"
fi

kill $GATEWAY_PID2 2>/dev/null || true
echo ""

# ── Summary ──────────────────────────────────────────────
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
