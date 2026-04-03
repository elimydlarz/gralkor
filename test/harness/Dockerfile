FROM node:22-bookworm

# Python 3.12+ and build tools for falkordblite
RUN apt-get update -qq && \
    apt-get install -y -qq python3 python3-venv python3-dev build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Verify tools
RUN node --version && uv --version && python3 --version

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
