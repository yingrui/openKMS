#!/usr/bin/env bash
# Start MLX-VLM server for PaddleOCR document extraction.
# Backend expects server at http://localhost:8101/
#
# Usage:
#   ./start.sh                    # default port 8101
#   ./start.sh --port 8102        # custom port
#   ./start.sh --trust-remote-code # required for some models
#   PORT=8102 ./start.sh          # override via env

set -e
cd "$(dirname "$0")"

export HF_ENDPOINT="${HF_ENDPOINT:-https://hf-mirror.com}"

# The server resolves the repo id on the **first request**, not at startup: with no network that is a
# ReadTimeout and a 500 per request, which reads like "the VLM is broken". Serve from the cache —
# `VLM_ALLOW_DOWNLOAD=1 ./start.sh` for the very first run (or prefetch with `hf download …` once).
if [[ "${VLM_ALLOW_DOWNLOAD:-0}" == "1" ]]; then
  export HF_HUB_OFFLINE=0
else
  export HF_HUB_OFFLINE="${HF_HUB_OFFLINE:-1}"
fi

# Activate venv if present
if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

# Ensure mlx-vlm is installed
if ! python -c "import mlx_vlm.server" 2>/dev/null; then
  echo "Installing mlx-vlm..."
  pip install -r requirements.txt
fi

# Add --port 8101 unless already specified (backend default)
if [[ " $* " != *" --port "* ]]; then
  set -- --port "${PORT:-8101}" "$@"
fi

exec mlx_vlm.server "$@"
