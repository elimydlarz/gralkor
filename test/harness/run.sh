#!/usr/bin/env bash
set -euo pipefail

echo "=== Gralkor Install Harness ==="
echo ""

# Configure API keys and provider from env vars at runtime.
# Usage: docker run --rm -it -e OPENAI_API_KEY=... gralkor-harness:latest
#
# Provider auto-detection: uses the first available key.
# Override with LLM_PROVIDER/EMBEDDER_PROVIDER env vars.
DETECTED_PROVIDER=""
if [ -n "${GOOGLE_API_KEY:-}" ]; then
  echo "Configuring googleApiKey from env..."
  npx openclaw config set plugins.entries.gralkor.config.googleApiKey "$GOOGLE_API_KEY" 2>&1
  DETECTED_PROVIDER="${DETECTED_PROVIDER:-gemini}"
fi
if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo "Configuring openaiApiKey from env..."
  npx openclaw config set plugins.entries.gralkor.config.openaiApiKey "$OPENAI_API_KEY" 2>&1
  DETECTED_PROVIDER="${DETECTED_PROVIDER:-openai}"
fi
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "Configuring anthropicApiKey from env..."
  npx openclaw config set plugins.entries.gralkor.config.anthropicApiKey "$ANTHROPIC_API_KEY" 2>&1
  DETECTED_PROVIDER="${DETECTED_PROVIDER:-anthropic}"
fi
if [ -n "${GROQ_API_KEY:-}" ]; then
  echo "Configuring groqApiKey from env..."
  npx openclaw config set plugins.entries.gralkor.config.groqApiKey "$GROQ_API_KEY" 2>&1
  DETECTED_PROVIDER="${DETECTED_PROVIDER:-groq}"
fi

# Set LLM provider (anthropic/groq need openai for embeddings)
LLM_PROVIDER="${LLM_PROVIDER:-$DETECTED_PROVIDER}"
EMBEDDER_PROVIDER="${EMBEDDER_PROVIDER:-}"
if [ -n "$LLM_PROVIDER" ] && [ "$LLM_PROVIDER" != "gemini" ]; then
  echo "Setting llm.provider=$LLM_PROVIDER..."
  npx openclaw config set plugins.entries.gralkor.config.llm '{"provider":"'"$LLM_PROVIDER"'"}' 2>&1
fi
if [ -n "$LLM_PROVIDER" ] && [ "$LLM_PROVIDER" != "gemini" ]; then
  # Anthropic/Groq don't have embedders — fall back to openai
  EMBEDDER_PROVIDER="${EMBEDDER_PROVIDER:-openai}"
  echo "Setting embedder.provider=$EMBEDDER_PROVIDER..."
  npx openclaw config set plugins.entries.gralkor.config.embedder '{"provider":"'"$EMBEDDER_PROVIDER"'"}' 2>&1
fi
echo ""

# 1. Verify OpenClaw sees the plugin
echo "--- npx openclaw plugins list ---"
npx openclaw plugins list 2>&1 || true
echo ""

# 2. Show plugin config (redact API keys)
echo "--- npx openclaw config get plugins ---"
npx openclaw config get plugins 2>&1 | sed -E 's/("(google|openai|anthropic|groq)Api[Kk]ey"\s*:\s*")[^"]+/\1***REDACTED***/g' || true
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
