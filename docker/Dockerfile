# Multi-target image: backend API and procrastinate worker (worker includes openkms-cli).
# Build: docker compose build
# Context: repository root (.. when invoked from docker/)
#
# Optional faster builds on slow networks (e.g. China): pass build-args — see docker/README.md
#   APT_MIRROR=mirrors.aliyun.com
#   UV_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/
#   UV_EXTRA_INDEX_URL=https://pypi.org/simple
#   NPM_REGISTRY=https://registry.npmmirror.com  (frontend Dockerfile only)

FROM python:3.12-slim-bookworm AS base

WORKDIR /app

ARG APT_MIRROR=
ARG UV_INDEX_URL=
ARG UV_EXTRA_INDEX_URL=
COPY docker/apt-set-mirror.sh /usr/local/bin/apt-set-mirror.sh
RUN chmod +x /usr/local/bin/apt-set-mirror.sh \
    && APT_MIRROR="${APT_MIRROR}" apt-set-mirror.sh \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
COPY backend/worker.py .

ENV UV_INDEX_URL=${UV_INDEX_URL} \
    UV_EXTRA_INDEX_URL=${UV_EXTRA_INDEX_URL}

RUN uv sync --frozen --no-dev

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH=/app

FROM base AS backend

EXPOSE 8102

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -sf http://127.0.0.1:8102/health > /dev/null || exit 1

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8102"]

# Worker: install openkms-cli[parse] for PaddleOCR-VL. Paddle wheels are linux/amd64 (not linux/arm64).
# Build this target with platform linux/amd64 (see docker-compose worker `platform:`), e.g. `docker compose build worker`.
FROM base AS worker

# opencv-contrib-python (paddlex) needs libGL at import time even for headless parse.
# Apt sources already mirrored in `base` when APT_MIRROR was set at build time.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgomp1 \
    libglib2.0-0 \
    libreoffice-writer \
    libreoffice-impress \
    mupdf-tools \
    && rm -rf /var/lib/apt/lists/*

COPY openkms-cli /openkms-cli

RUN cd /openkms-cli && uv pip install --python /app/.venv/bin/python -e ".[pipeline,metadata,kb,parse]"

WORKDIR /app

CMD ["python", "worker.py"]
