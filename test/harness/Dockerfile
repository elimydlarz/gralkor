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

# Install OpenClaw globally (avoids slow npx re-downloads under emulation)
RUN npm install -g openclaw

# Verify tools
RUN node --version && openclaw --version && uv --version && uv python list --only-installed

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

# Configure plugin: assign memory slot, set required dataDir, enable test logging
RUN openclaw config set plugins.slots.memory gralkor && \
    openclaw config set plugins.entries.gralkor.config.dataDir /data/gralkor && \
    openclaw config set plugins.entries.gralkor.config.test true

WORKDIR /root

# Source tree for running functional tests (src + test/functional + dev deps).
# Copied in by build.sh as gralkor-src/ in the build context.
COPY gralkor-src/ /app/gralkor-src/
RUN cd /app/gralkor-src && pnpm install --frozen-lockfile

# Default: run the harness test script
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
