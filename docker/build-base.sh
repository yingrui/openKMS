#!/bin/sh
# Rebuild shared base image (run when backend/uv.lock changes).
set -e
cd "$(dirname "$0")"
docker compose -f docker-compose.yml --profile build build openkms-base
