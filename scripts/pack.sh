#!/usr/bin/env bash
set -euo pipefail

pnpm run --silent build

version=$(node -p "require('./resources/memory/package.json').version")

FALKORDBLITE_VERSION="v0.9.0"

echo "Building falkordblite wheel for linux/arm64..."
rm -rf server/wheels
mkdir -p server/wheels
docker run --rm --platform linux/arm64 \
  -v "$(pwd)/server/wheels:/out" \
  python:3.13-bookworm \
  bash -c "
    set -e
    apt-get update -qq && apt-get install -y -qq build-essential git > /dev/null
    git clone --depth 1 --branch ${FALKORDBLITE_VERSION} https://github.com/FalkorDB/falkordblite.git /tmp/fdb
    cd /tmp/fdb
    pip install --quiet wheel setuptools
    python setup.py bdist_wheel
    python -m wheel tags --remove --python-tag py3 --abi-tag none dist/*.whl
    cp dist/*.whl /out/
  "
ls server/wheels/

cp resources/memory/package.json package.json
cp resources/memory/openclaw.plugin.json openclaw.plugin.json
pnpm pack >/dev/null 2>&1

rm -rf server/wheels

mv "susu-eng-gralkor-${version}.tgz" "susu-eng-gralkor-memory-${version}.tgz"

echo "susu-eng-gralkor-memory-${version}.tgz"
