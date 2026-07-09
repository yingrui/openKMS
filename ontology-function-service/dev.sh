#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
export PYTHONPATH="${PWD}:${PYTHONPATH:-}"
exec uvicorn ofs.main:app --host 0.0.0.0 --port "${OPENKMS_ONTOLOGY_FUNCTION_SERVICE_PORT:-8105}" --reload
