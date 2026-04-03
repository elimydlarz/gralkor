#!/usr/bin/env bash
set -euo pipefail

echo "=== Gralkor Install Harness ==="
echo ""

# 1. Verify OpenClaw sees the plugin
echo "--- npx openclaw plugins list ---"
npx openclaw plugins list 2>&1 || true
echo ""

# 2. Show plugin config
echo "--- npx openclaw config get plugins ---"
npx openclaw config get plugins 2>&1 || true
echo ""

# 3. Check installed plugin files
echo "--- Plugin directory contents ---"
PLUGIN_DIR="$HOME/.openclaw/extensions/gralkor"
if [ -d "$PLUGIN_DIR" ]; then
  echo "$PLUGIN_DIR exists"
  ls -la "$PLUGIN_DIR/" 2>/dev/null || true
  echo ""
  echo "dist/:"
  ls -la "$PLUGIN_DIR/dist/" 2>/dev/null || echo "  (no dist/)"
  echo ""
  echo "server/:"
  ls -la "$PLUGIN_DIR/server/" 2>/dev/null || echo "  (no server/)"
  echo ""
  echo "openclaw.plugin.json:"
  cat "$PLUGIN_DIR/openclaw.plugin.json" 2>/dev/null || echo "  (missing)"
  echo ""
  echo "package.json:"
  cat "$PLUGIN_DIR/package.json" 2>/dev/null || echo "  (missing)"
else
  echo "WARNING: $PLUGIN_DIR does not exist!"
  echo "Searching for plugin files..."
  find "$HOME/.openclaw" -name "openclaw.plugin.json" 2>/dev/null || true
fi
echo ""

# 4. Try to start the gateway briefly to see if plugin loads
echo "--- Gateway startup test (10s timeout) ---"
echo "Starting openclaw gateway to verify plugin loading..."

# Create a minimal workspace
mkdir -p /tmp/harness-workspace

# Run gateway with timeout — we just want to see if the plugin loads
# The gateway will fail eventually (no LLM key) but we care about plugin load logs
timeout 30 openclaw gateway start --workspace /tmp/harness-workspace 2>&1 || EXIT_CODE=$?

echo ""
echo "Gateway exited with code: ${EXIT_CODE:-0}"
echo ""
echo "=== Harness complete ==="
