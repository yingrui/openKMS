#!/bin/sh
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
VERSION="$(git -C "$ROOT" rev-parse --short=6 HEAD 2>/dev/null || echo dev)"
export VITE_APP_VERSION="$VERSION"
cd "$DIR"
"$DIR/build-base.sh"
docker compose -f docker-compose.yml build --build-arg "VITE_APP_VERSION=${VERSION}"
docker compose -f docker-compose.yml down
docker compose -f docker-compose.yml up -d
