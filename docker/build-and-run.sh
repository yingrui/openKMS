#!/bin/sh
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(git -C "$ROOT" rev-parse --short=6 HEAD 2>/dev/null || echo dev)"
export VITE_APP_VERSION="$VERSION"
docker builder prune -f
docker compose -f docker-compose.yml build --build-arg "VITE_APP_VERSION=${VERSION}"
docker compose -f docker-compose.yml down
docker compose -f docker-compose.yml up -d
