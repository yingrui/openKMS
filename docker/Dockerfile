# Backend + worker app layers on pre-built bases (docker/Dockerfile.*-base).
# Context: repository root.

# Both ARGs must precede the first FROM (BuildKit requirement for FROM ${…}).
ARG OPENKMS_BACKEND_BASE_IMAGE=openkms-backend-base:local
ARG OPENKMS_WORKER_BASE_IMAGE=openkms-worker-base:local

FROM ${OPENKMS_BACKEND_BASE_IMAGE} AS base

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
COPY backend/worker.py .
COPY backend/scheduler.py .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev

FROM base AS backend

EXPOSE 8102

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -sf http://127.0.0.1:8102/health > /dev/null || exit 1

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8102"]

# Worker: openkms-cli parse/pipeline deps are in openkms-worker-base; refresh editable source only.
FROM ${OPENKMS_WORKER_BASE_IMAGE} AS worker

COPY backend/app ./app
COPY backend/worker.py .

COPY openkms-cli /openkms-cli

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev \
    && uv pip install --python /app/.venv/bin/python -e "/openkms-cli" --no-deps

WORKDIR /app

CMD ["python", "worker.py"]
