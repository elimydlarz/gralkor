#!/usr/bin/env bash
set -euo pipefail

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Gralkor Install Harness ==="
echo ""

# ── Configure ──────────────────────────────────────────────
API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
if [ -n "$API_KEY" ]; then
  echo "Configuring googleApiKey from env..."
  openclaw config set plugins.entries.gralkor.config.googleApiKey "$API_KEY" >/dev/null 2>&1
else
  echo "WARNING: GEMINI_API_KEY not set — server will fail to start"
fi
echo ""

# ── 1. Plugin install ─────────────────────────────────────
echo "--- 1. Plugin install ---"
PLUGIN_DIR="$HOME/.openclaw/extensions/gralkor"
if [ -d "$PLUGIN_DIR" ]; then
  pass "plugin directory exists"
else
  fail "plugin directory missing"
fi

if [ -f "$PLUGIN_DIR/openclaw.plugin.json" ]; then
  pass "openclaw.plugin.json present"
else
  fail "openclaw.plugin.json missing"
fi

if [ -f "$PLUGIN_DIR/dist/index.js" ]; then
  pass "dist/index.js present"
else
  fail "dist/index.js missing"
fi

if [ -f "$PLUGIN_DIR/server/main.py" ]; then
  pass "server/main.py present"
else
  fail "server/main.py missing"
fi
echo ""

# ── 2. Plugin loads in OpenClaw ───────────────────────────
echo "--- 2. Plugin loads ---"
LIST_OUTPUT=$(openclaw plugins list 2>&1)
if echo "$LIST_OUTPUT" | grep -q "gralkor.*loaded"; then
  pass "plugin listed as loaded"
else
  fail "plugin not loaded"
  echo "$LIST_OUTPUT" | grep -i gralkor || true
fi
echo ""

# ── 3. Server health ─────────────────────────────────────
echo "--- 3. Server health ---"
echo "Waiting for server (up to 120s)..."
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

# ── 4. Ingest (capture) smoke test ───────────────────────
echo "--- 4. Ingest smoke test ---"
if [ "$SERVER_OK" = true ]; then
  INGEST_RESP=$(curl -s -w '\n%{http_code}' -X POST http://127.0.0.1:8001/ingest-messages \
    -H 'Content-Type: application/json' \
    -d '{
      "name": "harness_smoke",
      "source_description": "harness smoke test",
      "group_id": "harness",
      "idempotency_key": "smoke-001",
      "messages": [
        {"role": "user", "content": [{"type": "text", "text": "My favorite color is blue and I work at Acme Corp"}]},
        {"role": "assistant", "content": [{"type": "text", "text": "Got it! Your favorite color is blue and you work at Acme Corp."}]}
      ]
    }' 2>&1)

  INGEST_CODE=$(echo "$INGEST_RESP" | tail -1)
  INGEST_BODY=$(echo "$INGEST_RESP" | sed '$d')

  if [ "$INGEST_CODE" = "200" ]; then
    pass "ingest returned 200"
  else
    fail "ingest returned $INGEST_CODE"
    echo "  $INGEST_BODY"
  fi
else
  fail "ingest skipped (server not healthy)"
fi
echo ""

# ── 5. Search (recall) smoke test ────────────────────────
echo "--- 5. Search smoke test ---"
if [ "$SERVER_OK" = true ]; then
  # Give graphiti a moment to process the episode
  sleep 3

  SEARCH_RESP=$(curl -s -w '\n%{http_code}' -X POST http://127.0.0.1:8001/search \
    -H 'Content-Type: application/json' \
    -d '{"query": "favorite color", "group_ids": ["harness"], "num_results": 5}' 2>&1)

  SEARCH_CODE=$(echo "$SEARCH_RESP" | tail -1)
  SEARCH_BODY=$(echo "$SEARCH_RESP" | sed '$d')

  if [ "$SEARCH_CODE" = "200" ]; then
    pass "search returned 200"
    FACT_COUNT=$(echo "$SEARCH_BODY" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('facts',[])))" 2>/dev/null || echo "?")
    echo "  facts returned: $FACT_COUNT"
  else
    fail "search returned $SEARCH_CODE"
    echo "  $SEARCH_BODY"
  fi
else
  fail "search skipped (server not healthy)"
fi
echo ""

# ── Summary ──────────────────────────────────────────────
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
