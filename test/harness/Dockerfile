FROM node:22-bookworm

# Build tools for falkordblite native extensions
RUN apt-get update -qq && \
    apt-get install -y -qq build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# uv (Python package manager) — also provides Python 3.12+ via managed installs
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install Python 3.13 via uv (Bookworm ships 3.11 but server needs 3.12+)
RUN uv python install 3.13

# Install pnpm and OpenClaw globally
RUN npm install -g pnpm openclaw

# Verify tools
RUN node --version && pnpm --version && openclaw --version && uv --version && uv python list --only-installed

# OpenClaw HOME
ENV HOME=/root
RUN mkdir -p /root/.openclaw

# Install plugin.
# PLUGIN_SOURCE is either:
#   - "@susu-eng/gralkor"          (npm, matches real operator flow)
#   - "/tmp/plugin.tgz"            (local tarball, for testing local changes)
#
# To test from npm:   docker build --build-arg PLUGIN_SOURCE=@susu-eng/gralkor ...
# To test from local: copy plugin.tgz into build context first (build.sh does this)
ARG PLUGIN_SOURCE=/tmp/plugin.tgz
COPY plugin.tgz /tmp/plugin.tgz

RUN openclaw plugins install ${PLUGIN_SOURCE} --dangerously-force-unsafe-install

# Configure gateway mode and plugin: assign memory slot, set required dataDir, enable test logging
RUN openclaw config set gateway.mode local && \
    openclaw config set plugins.slots.memory gralkor && \
    openclaw config set plugins.entries.gralkor.config.dataDir /data/gralkor && \
    openclaw config set plugins.entries.gralkor.config.test true

# Pre-warm: sync server venv at build time (avoids slow uv sync on first container boot).
# Skip falkordblite via PyPI — the PyPI arm64 wheel requires manylinux_2_39 (glibc 2.39+)
# but Bookworm only ships glibc 2.36, so uv falls back to the sdist which embeds x86-64
# binaries. The bundled arm64 wheel (built by build-arm64-wheel.sh) is installed instead.
RUN mkdir -p /data/gralkor && \
    UV_PROJECT_ENVIRONMENT=/data/gralkor/venv \
    uv sync --no-dev --frozen --no-install-package falkordblite \
      --directory /root/.openclaw/extensions/gralkor/server

# Install bundled arm64 falkordblite wheel — must succeed, no PyPI fallback.
RUN VIRTUAL_ENV=/data/gralkor/venv uv pip install --no-deps \
      /root/.openclaw/extensions/gralkor/server/wheels/*.whl

WORKDIR /root

# Source tree for running functional tests (src + test/functional + dev deps).
# Copied in by build.sh as gralkor-src/ in the build context.
COPY gralkor-src/ /app/gralkor-src/
RUN cd /app/gralkor-src && pnpm install

# Default: run the harness test script
COPY run-functional-tests.sh /run-functional-tests.sh
RUN chmod +x /run-functional-tests.sh
CMD ["/run-functional-tests.sh"]
