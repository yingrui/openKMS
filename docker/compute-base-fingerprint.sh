#!/bin/sh
# Print a hash of inputs that invalidate openkms-*-base images.
# Used by build-base.sh and build-and-run.sh (do not rely on cwd).
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"

hash_cmd() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  else
    shasum -a 256 | awk '{print $1}'
  fi
}

cat \
  "$ROOT/backend/uv.lock" \
  "$ROOT/openkms-cli/uv.lock" \
  "$ROOT/openkms-cli/pyproject.toml" \
  "$DIR/Dockerfile.backend-base" \
  "$DIR/Dockerfile.worker-base" \
  | hash_cmd
