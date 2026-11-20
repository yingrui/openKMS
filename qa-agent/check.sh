#!/usr/bin/env bash
# qa-agent gates in one command — run from qa-agent/.
#
# This service had no check at all, and that is how two undefined names (`fetch_skill_prompts`, `llm_cfg`) reached a
# running process: pytest passes because no test exercises the entry points that use them, and nothing else looked.
# The ruff run uses `pyproject.toml`'s selection — the same E9/F/B/BLE list `backend/pyproject.toml` uses, so one
# command means one standard across the services. It is clean today; a new finding fails the gate instead of joining a
# backlog. Style families the repo does not enforce anywhere (import order, modernisation, simplification, log format)
# stay out on purpose.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

status=0

echo "→ ruff (E9/F/B/BLE — same selection as backend)"
uv run --group dev --with ruff ruff check qa_agent tests || status=1

echo "→ pytest"
uv run --group dev pytest -q || status=1

if [ "$status" -eq 0 ]; then
  echo "check-qa-agent: OK"
fi
exit "$status"
