#!/bin/sh
# Rebuild pre-built base images (run when backend/uv.lock or openkms-cli deps change).
#
# Platform strategy:
#   - backend-base: native (arm64 on Apple Silicon) — used by backend/scheduler
#   - backend-base-amd64: linux/amd64 — used as the FROM for worker-base
#   - worker-base: linux/amd64 (PaddleOCR wheels require x86_64)
#
# Compose picks the right image:
#   backend/scheduler → openkms-backend-base:local (native)
#   worker            → openkms-worker-base:local   (amd64, extends the amd64 copy)
set -e
cd "$(dirname "$0")"

BACKEND_IMAGE="openkms-backend-base:${OPENKMS_BACKEND_BASE_TAG:-local}"
BACKEND_AMD64_IMAGE="openkms-backend-base:${OPENKMS_BACKEND_BASE_TAG:-local}-amd64"
WORKER_IMAGE="openkms-worker-base:${OPENKMS_WORKER_BASE_TAG:-local}"

MIRROR_ARGS="--build-arg APT_MIRROR=${APT_MIRROR:-mirrors.aliyun.com} --build-arg UV_INDEX_URL=${UV_INDEX_URL:-https://mirrors.aliyun.com/pypi/simple/} --build-arg UV_EXTRA_INDEX_URL=${UV_EXTRA_INDEX_URL:-}"

# 1. Backend base for compose's backend & scheduler (native platform).
docker buildx build --load \
  -t "$BACKEND_IMAGE" \
  -f Dockerfile.backend-base \
  $MIRROR_ARGS \
  ..

# 2. Backend base for amd64 — worker-base extends this.
docker buildx build --load \
  --platform linux/amd64 \
  -t "$BACKEND_AMD64_IMAGE" \
  -f Dockerfile.backend-base \
  $MIRROR_ARGS \
  ..

# 3. Worker base (amd64) — FROM the amd64 copy of backend-base.
docker buildx build --load \
  --platform linux/amd64 \
  -t "$WORKER_IMAGE" \
  -f Dockerfile.worker-base \
  --build-arg "OPENKMS_BACKEND_BASE_IMAGE=${BACKEND_AMD64_IMAGE}" \
  $MIRROR_ARGS \
  ..
