#!/usr/bin/env bash
# Build falkordblite wheel for linux/arm64 via Docker.
# Output: server/wheels/*.whl
set -euo pipefail

FALKORDBLITE_VERSION="${FALKORDBLITE_VERSION:-v0.9.0}"

echo "Building falkordblite wheel for linux/arm64..."
rm -rf server/wheels
mkdir -p server/wheels
docker run --rm --platform linux/arm64 \
  -v "$(pwd)/server/wheels:/out" \
  python:3.13-bookworm \
  bash -c "
    set -e
    rm -rf /var/lib/apt/lists/* && apt-get update -qq && apt-get install -y -qq build-essential git > /dev/null
    git clone --depth 1 --branch ${FALKORDBLITE_VERSION} https://github.com/FalkorDB/falkordblite.git /tmp/fdb
    cd /tmp/fdb
    python -m venv /tmp/build-env
    /tmp/build-env/bin/pip install --quiet wheel setuptools
    /tmp/build-env/bin/python setup.py bdist_wheel
    rm -rf redis.submodule build  # free disk before copying wheel out
    /tmp/build-env/bin/python -m wheel tags --remove --python-tag py3 --abi-tag none --platform-tag manylinux_2_36_aarch64 dist/*.whl
    # On Docker Desktop for macOS, bind-mount cp can return a spurious
    # 'No such file or directory' even though the file lands on the host.
    # Suppress the exit code here and verify on the host after the container exits.
    cp dist/*.whl /out/ 2>/dev/null || true
  "
# Verify the wheel actually made it to the host (the real check, since the
# in-container cp exit code is unreliable on Docker Desktop for macOS).
if ! ls server/wheels/falkordblite-*.whl >/dev/null 2>&1; then
  echo "ERROR: arm64 wheel build did not produce a wheel in server/wheels/" >&2
  exit 1
fi
ls server/wheels/
