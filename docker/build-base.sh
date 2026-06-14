#!/bin/sh
# Rebuild pre-built base images (run when backend/uv.lock or openkms-cli deps change).
# Worker base extends the backend base image — build backend first (compose parallelizes otherwise).
set -e
cd "$(dirname "$0")"
docker compose -f docker-compose.yml --profile build build openkms-backend-base
docker compose -f docker-compose.yml --profile build build openkms-worker-base
