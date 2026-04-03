# Default amd64 — matches most operator environments and avoids
# the falkordb.so arch mismatch on Apple Silicon.
# Override with: docker build --platform linux/arm64 ...
FROM --platform=${TARGETPLATFORM:-linux/amd64} node:22-bookworm

# Build tools for falkordblite native extensions
RUN apt-get update -qq && \
    apt-get install -y -qq build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# uv (Python package manager) — also provides Python 3.12+ via managed installs
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install Python 3.13 via uv (Bookworm ships 3.11 but server needs 3.12+)
RUN uv python install 3.13

# Verify tools
RUN node --version && uv --version && uv python list --only-installed

# OpenClaw HOME
ENV HOME=/root
RUN mkdir -p /root/.openclaw

# Install plugin via the same npx method operators use.
# PLUGIN_SOURCE is either:
#   - "@susu-eng/gralkor"          (npm, matches real operator flow)
#   - "/tmp/plugin.tgz"            (local tarball, for testing local changes)
#
# To test from npm:   docker build --build-arg PLUGIN_SOURCE=@susu-eng/gralkor ...
# To test from local: copy plugin.tgz into build context first (build.sh does this)
ARG PLUGIN_SOURCE=/tmp/plugin.tgz
COPY plugin.tgz /tmp/plugin.tgz

RUN npx openclaw plugins install ${PLUGIN_SOURCE} --dangerously-force-unsafe-install

# Configure plugin: assign memory slot + enable with test logging
RUN npx openclaw config set plugins.slots.memory gralkor && \
    npx openclaw config set plugins.entries.gralkor.config.test true

WORKDIR /root

# Default: run the harness test script
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
