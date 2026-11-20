#!/usr/bin/env bash
# qa-agent gates in one command — run from qa-agent/.
#
# This service had no check at all, and that is how two undefined names (`fetch_skill_prompts`, `llm_cfg`) reached a
# running process: pytest passes because no test exercises the entry points that use them, and nothing else looked.
# The ruff run is deliberately narrow — `F821` (undefined name) only. The package has 60+ findings under the full
# ruleset, and fixing them is its own task (docs/tech_debt.md); a gate that fails on day one gets deleted, not fixed.
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

status=0

echo "→ undefined names (F821)"
uv run --group dev --with ruff ruff check --select F821 qa_agent tests || status=1

echo "→ pytest"
uv run --group dev pytest -q || status=1

if [ "$status" -eq 0 ]; then
  echo "check-qa-agent: OK"
fi
exit "$status"
