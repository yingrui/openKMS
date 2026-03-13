#!/usr/bin/env bash
# QA Agent dev server - activates venv, starts on port 8103
set -e
cd "$(dirname "$0")"

# Activate venv if present
if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

exec python -m qa_agent.main
