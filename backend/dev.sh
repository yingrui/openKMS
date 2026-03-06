#!/usr/bin/env bash
# Backend dev server - activates venv, runs migrations, starts uvicorn
set -e
cd "$(dirname "$0")"

# Activate venv if present
if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

# Run migrations
if command -v alembic &>/dev/null; then
  alembic upgrade head 2>/dev/null || true
fi

exec uvicorn app.main:app --reload --port 8102
