# Multi-target image: backend API and procrastinate worker (worker includes openkms-cli).
# Build: docker compose build
# Context: repository root (.. when invoked from docker/)

FROM python:3.12-slim-bookworm AS base

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY backend/pyproject.toml backend/uv.lock ./
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
COPY backend/worker.py .

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
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libgomp1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY openkms-cli /openkms-cli

RUN cd /openkms-cli && uv pip install --python /app/.venv/bin/python -e ".[pipeline,metadata,kb,parse]"

WORKDIR /app

CMD ["python", "worker.py"]
