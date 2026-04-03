#!/usr/bin/env bash
set -euo pipefail

echo "=== Gralkor Install Harness ==="
echo ""

# Configure API keys from env at runtime.
# Usage: docker run --rm -it -e GEMINI_API_KEY=... -e OPENAI_API_KEY=... gralkor-harness:latest
# Note: graphiti-core always needs OPENAI_API_KEY for its reranker, even with Gemini.
API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
if [ -n "$API_KEY" ]; then
  echo "Configuring googleApiKey from env..."
  npx openclaw config set plugins.entries.gralkor.config.googleApiKey "$API_KEY" 2>&1
else
  echo "WARNING: GEMINI_API_KEY not set — server will fail to start"
fi
if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo "Configuring openaiApiKey from env..."
  npx openclaw config set plugins.entries.gralkor.config.openaiApiKey "$OPENAI_API_KEY" 2>&1
else
  echo "WARNING: OPENAI_API_KEY not set — graphiti reranker will fail"
fi
echo ""

# 1. Verify OpenClaw sees the plugin
echo "--- npx openclaw plugins list ---"
npx openclaw plugins list 2>&1 || true
echo ""

# 2. Show plugin config (redact API keys)
echo "--- npx openclaw config get plugins ---"
npx openclaw config get plugins 2>&1 | sed -E 's/("googleApiKey"\s*:\s*")[^"]+/\1***REDACTED***/g' || true
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

# 4. Try to start the gateway to see if plugin + server load
echo "--- Gateway startup test (timeout: 180s) ---"
echo "Starting openclaw gateway to verify plugin loading..."

mkdir -p /tmp/harness-workspace

# Give the server time to start (venv sync + health polling can take ~2 min)
timeout 180 npx openclaw gateway start --workspace /tmp/harness-workspace 2>&1 || EXIT_CODE=$?

echo ""
echo "Gateway exited with code: ${EXIT_CODE:-0}"
echo ""
echo "=== Harness complete ==="
