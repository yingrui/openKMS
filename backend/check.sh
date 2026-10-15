#!/usr/bin/env bash
# Every backend gate in one command — run it from backend/ (or the CI job does).
#
# It exists so the workflow is a *script*, not prose in a guide: `uv run` guarantees the
# project venv (a system Python is missing the optional deps, which shows up as a wall of
# collection errors unrelated to your change), and the noqa watch enforces "fix it, don't
# silence it".
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

status=0

echo "→ ruff"
uv run ruff check app tests || status=1

echo "→ no suppressions"
# A `# noqa` is a claim that the rule is wrong; that should be a review decision, not a
# drive-by. The allowlist is exactly one module: `app/services/boundaries.py` owns the single
# blanket `except Exception`-by-design (see its docstring) that SSE streams, health probes and
# worker tasks route through, so every other module names the failures it expects.
NOQA_ALLOW='app/services/boundaries.py'
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  if ! grep -qxF "$file" <<<"$NOQA_ALLOW"; then
    echo "check-backend: $hit silences a rule with noqa; fix the finding instead" >&2
    status=1
  fi
done < <(rg -n --no-heading '#\s*noqa' app tests --glob '*.py' || true)

echo "→ pytest"
uv run pytest -q || status=1

if [ "$status" -eq 0 ]; then
  echo "check-backend: OK"
fi
exit "$status"
