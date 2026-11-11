#!/usr/bin/env bash
# QA agent dev server: venv, then uvicorn on 8103 with auto-reload.
set -e
cd "$(dirname "$0")"

if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

# Reload on save. `--reload-dir qa_agent` keeps `sessions/` out of the watch — the agent writes there while it answers,
# and restarting mid-turn killed the answer. `OPENKMS_DEV_RELOAD=0` runs without a reloader, as production does.
if [[ "${OPENKMS_DEV_RELOAD:-1}" == "0" ]]; then
  exec python -m uvicorn qa_agent.main:app --host 0.0.0.0 --port 8103
fi
exec python -m uvicorn qa_agent.main:app --host 0.0.0.0 --port 8103 --reload --reload-dir qa_agent
