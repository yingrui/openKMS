#!/bin/sh
# Rebuild and restart the openKMS Docker stack (from this directory: docker/).
#
# Two image layers:
#   1) Bases (slow)  — openkms-backend-base, openkms-worker-base (uv locks, Paddle, apt)
#   2) Apps  (fast)  — backend, worker, frontend, qa-agent, ofs, …
#
# Default: rebuild bases only when their inputs changed, then rebuild apps, then restart.
#
# Usage:
#   ./build-and-run.sh                  # auto bases → apps → restart
#   ./build-and-run.sh --rebuild-bases  # always rebuild bases → apps → restart
#   ./build-and-run.sh --apps-only      # apps → restart (bases must already exist)
#   ./build-and-run.sh -h | --help
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
VERSION="$(git -C "$ROOT" rev-parse --short=6 HEAD 2>/dev/null || echo dev)"
export VITE_APP_VERSION="$VERSION"
cd "$DIR"

BACKEND_TAG="${OPENKMS_BACKEND_BASE_TAG:-local}"
WORKER_TAG="${OPENKMS_WORKER_BASE_TAG:-local}"
FP_FILE="$DIR/.base-fingerprint"
FP_SCRIPT="$DIR/compute-base-fingerprint.sh"

usage() {
  cat <<'EOF'
Rebuild and restart the openKMS Docker stack (from this directory: docker/).

Two image layers:
  1) Bases (slow)  — openkms-backend-base, openkms-worker-base (uv locks, Paddle, apt)
  2) Apps  (fast)  — backend, worker, frontend, qa-agent, ofs, …

Default: rebuild bases only when their inputs changed, then rebuild apps, then restart.

Usage:
  ./build-and-run.sh                  # auto bases → apps → restart
  ./build-and-run.sh --rebuild-bases  # always rebuild bases → apps → restart
  ./build-and-run.sh --apps-only      # apps → restart (bases must already exist)
  ./build-and-run.sh -h | --help
EOF
}

BASES_MODE=auto
for arg in "$@"; do
  case "$arg" in
    -h | --help)
      usage
      exit 0
      ;;
    --rebuild-bases)
      BASES_MODE=always
      ;;
    --apps-only)
      BASES_MODE=never
      ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Try: ./build-and-run.sh --help" >&2
      exit 2
      ;;
  esac
done

bases_images_exist() {
  docker image inspect "openkms-backend-base:${BACKEND_TAG}" >/dev/null 2>&1 \
    && docker image inspect "openkms-worker-base:${WORKER_TAG}" >/dev/null 2>&1
}

bases_fingerprint_fresh() {
  [ -f "$FP_FILE" ] && [ "$("$FP_SCRIPT")" = "$(cat "$FP_FILE")" ]
}

ensure_bases() {
  case "$BASES_MODE" in
    never)
      if ! bases_images_exist; then
        echo "Base images missing. Run: ./build-and-run.sh --rebuild-bases" >&2
        exit 1
      fi
      echo "Using existing base images (--apps-only)"
      ;;
    always)
      echo "Rebuilding base images (--rebuild-bases)"
      "$DIR/build-base.sh"
      ;;
    auto)
      if bases_images_exist && bases_fingerprint_fresh; then
        echo "Base images up to date; not rebuilding"
      else
        echo "Base images missing or deps changed; rebuilding"
        "$DIR/build-base.sh"
      fi
      ;;
  esac
}

ensure_bases

echo "Building app images (VITE_APP_VERSION=${VERSION})"
docker compose -f docker-compose.yml build --build-arg "VITE_APP_VERSION=${VERSION}"

echo "Restarting stack"
docker compose -f docker-compose.yml down
docker compose -f docker-compose.yml up -d

echo "Done. UI: http://localhost:8082"
