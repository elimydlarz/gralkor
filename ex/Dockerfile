# syntax=docker/dockerfile:1
ARG ELIXIR_IMAGE=hexpm/elixir:1.17.3-erlang-27.2-debian-bookworm-20241202-slim
ARG RUNTIME_IMAGE=debian:bookworm-slim
ARG TARGETARCH

# ── Stage 1: compile Elixir release ────────────────────────
FROM ${ELIXIR_IMAGE} AS elixir-build
WORKDIR /build/ex
ENV MIX_ENV=prod
RUN mix local.hex --force && mix local.rebar --force
COPY ex/mix.exs ex/mix.lock ./
COPY ex/config ./config
RUN mix deps.get --only prod
COPY ex/lib ./lib
RUN mix deps.compile && mix release gralkor

# ── Stage 2: build Python venv (arm64 wheel aware) ─────────
FROM debian:bookworm-slim AS python-build
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3.12 python3.12-venv curl ca-certificates build-essential git \
    && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv
WORKDIR /build/server
COPY server/pyproject.toml server/uv.lock ./
RUN mkdir -p wheels
COPY server/wheels/ ./wheels/
ARG TARGETARCH
RUN if [ "$TARGETARCH" = "arm64" ] && ls wheels/falkordblite-*.whl >/dev/null 2>&1; then \
      uv sync --frozen --no-dev --no-install-package falkordblite \
      && uv pip install --no-deps wheels/falkordblite-*.whl ; \
    else \
      uv sync --frozen --no-dev ; \
    fi
COPY server ./

# ── Stage 3: runtime ───────────────────────────────────────
FROM ${RUNTIME_IMAGE} AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3.12 python3.12-venv libstdc++6 libncurses6 libssl3 curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && mv /root/.local/bin/uv /usr/local/bin/uv
ENV LANG=C.UTF-8 LC_ALL=C.UTF-8
RUN useradd -m -d /home/gralkor -s /bin/bash gralkor
WORKDIR /app
COPY --from=python-build --chown=gralkor:gralkor /build/server /app/server
COPY --from=elixir-build --chown=gralkor:gralkor /build/ex/_build/prod/rel/gralkor /app/gralkor
ENV GRALKOR_SERVER_DIR=/app/server
ENV GRALKOR_DATA_DIR=/data
RUN mkdir -p /data && chown gralkor:gralkor /data
USER gralkor
EXPOSE 4000
ENTRYPOINT ["/app/gralkor/bin/gralkor"]
CMD ["start"]
