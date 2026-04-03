FROM node:22-bookworm

# Python 3.12+ and build tools for falkordblite
RUN apt-get update -qq && \
    apt-get install -y -qq python3 python3-venv python3-dev build-essential curl && \
    rm -rf /var/lib/apt/lists/*

# uv (Python package manager)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:$PATH"

# Install OpenClaw globally
RUN npm install -g openclaw

# Verify tools
RUN node --version && openclaw --version && uv --version && python3 --version

# OpenClaw HOME — plugin data lives here
ENV HOME=/root
RUN mkdir -p /root/.openclaw

# Copy plugin tarball (built by host)
COPY plugin.tgz /tmp/plugin.tgz

# Install the plugin
RUN openclaw plugins install /tmp/plugin.tgz --dangerously-force-unsafe-install

# Configure plugin: assign memory slot + enable with minimal config
# (no API key — we just want to verify the install + load cycle)
RUN openclaw config set plugins.slots.memory gralkor && \
    openclaw config set plugins.entries.gralkor.config.test true

WORKDIR /root

# Default: run the harness test script
COPY run.sh /run.sh
RUN chmod +x /run.sh
CMD ["/run.sh"]
