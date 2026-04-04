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
    apt-get clean && apt-get update -qq && apt-get install -y -qq build-essential git > /dev/null
    git clone --depth 1 --branch ${FALKORDBLITE_VERSION} https://github.com/FalkorDB/falkordblite.git /tmp/fdb
    cd /tmp/fdb
    python -m venv /tmp/build-env
    /tmp/build-env/bin/pip install --quiet wheel setuptools
    /tmp/build-env/bin/python setup.py bdist_wheel
    /tmp/build-env/bin/python -m wheel tags --remove --python-tag py3 --abi-tag none --platform-tag manylinux_2_36_aarch64 dist/*.whl
    cp dist/*.whl /out/
  "
ls server/wheels/
