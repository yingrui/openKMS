# Backend + worker on a shared pre-built base (docker/Dockerfile.base → openkms-base:local).
# Context: repository root.

ARG OPENKMS_BASE_IMAGE=openkms-base:local
FROM ${OPENKMS_BASE_IMAGE} AS base

COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini .
COPY backend/worker.py .
COPY backend/scheduler.py .

RUN uv sync --frozen --no-dev

FROM base AS backend

EXPOSE 8102

HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
    CMD curl -sf http://127.0.0.1:8102/health > /dev/null || exit 1

CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port 8102"]

# Worker adds openkms-cli on top of the shared base (linux/amd64 for Paddle wheels).
FROM base AS worker

COPY openkms-cli /openkms-cli

RUN cd /openkms-cli && uv pip install --python /app/.venv/bin/python -e ".[pipeline,metadata,kb,parse,baidu]"

WORKDIR /app

CMD ["python", "worker.py"]
