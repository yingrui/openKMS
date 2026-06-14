#!/bin/sh
# Rebuild pre-built base images (run when backend/uv.lock or openkms-cli deps change).
set -e
cd "$(dirname "$0")"
docker compose -f docker-compose.yml --profile build build openkms-backend-base openkms-worker-base
