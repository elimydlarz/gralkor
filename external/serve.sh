#!/bin/sh
# Foreground entrypoint for the externally-managed gralkor server.
# Invoked by `make up`, by systemd's ExecStart on a deployed VM, or directly.

set -eu

EXTERNAL_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$EXTERNAL_DIR/.env" ]; then
  set -a
  . "$EXTERNAL_DIR/.env"
  set +a
fi

: "${HOST_PORT:=4000}"
: "${FALKORDB_DATA_DIR:=$EXTERNAL_DIR/data/falkordb}"
export HOST_PORT FALKORDB_DATA_DIR

cd "$EXTERNAL_DIR/../server"
exec uv run uvicorn main:app \
  --host 0.0.0.0 --port "$HOST_PORT" \
  --no-access-log --timeout-graceful-shutdown 30
