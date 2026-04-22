#!/usr/bin/env bash
# Backend dev server - activates venv, ensures pgvector, runs migrations, starts uvicorn
set -e
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

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

# Install embedded-agent deps (langchain) if missing. Some venvs have no pip (uv/conda); try uv, then
# ensurepip, then python -m pip. Use `python -m uvicorn` below so the same interpreter gets the packages.
openkms_install_agent_deps() {
  local -a pkgs=(-e . "langchain-core>=0.3" "langchain-openai>=0.2")
  if command -v uv &>/dev/null; then
    echo "openKMS: installing agent deps (uv pip; venv has no stdlib pip)..." >&2
    uv pip install "${pkgs[@]}"
  elif python -m pip --version &>/dev/null; then
    echo "openKMS: installing agent deps (python -m pip)..." >&2
    python -m pip install "${pkgs[@]}"
  else
    echo "openKMS: venv has no pip; running: python -m ensurepip" >&2
    python -m ensurepip --upgrade
    python -m pip install "${pkgs[@]}"
  fi
}

if ! python -c "import langchain_core" 2>/dev/null; then
  # set -e: failure of uv/pip/ensurepip exits the script; show recovery hints if the user runs set +e
  openkms_install_agent_deps
  python -c "import langchain_core" || {
    echo "openKMS: import langchain_core still fails. In backend: uv pip install -e . 'langchain-core>=0.3' 'langchain-openai>=0.2'" >&2
    echo "  or: python -m ensurepip  then: python -m pip install -e . 'langchain-core>=0.3' 'langchain-openai>=0.2'" >&2
    exit 1
  }
fi

# Ensure pgvector extension (check/install, then CREATE EXTENSION)
if [[ -f scripts/ensure_pgvector.py ]]; then
  python scripts/ensure_pgvector.py || exit 1
fi

# Run migrations
if command -v alembic &>/dev/null; then
  alembic upgrade head 2>/dev/null || true
fi

exec python -m uvicorn app.main:app --reload --port 8102
