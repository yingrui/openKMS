#!/usr/bin/env bash
# Backend dev server - activates venv, ensures pgvector, runs migrations, starts uvicorn
set -e
cd "$(dirname "$0")"

# Load .env for database config
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

# Allow default secret key in local development
export OPENKMS_DEBUG="${OPENKMS_DEBUG:-true}"

# Activate venv if present
if [[ -d .venv ]]; then
  source .venv/bin/activate
fi

# Ensure pgvector extension (check/install, then CREATE EXTENSION)
if [[ -f scripts/ensure_pgvector.py ]]; then
  python scripts/ensure_pgvector.py || exit 1
fi

# Run migrations
if command -v alembic &>/dev/null; then
  alembic upgrade head 2>/dev/null || true
fi

exec uvicorn app.main:app --reload --port 8102
