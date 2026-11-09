#!/usr/bin/env bash
# Every backend gate in one command — run it from backend/ (or the CI job does).
#
# It exists so the workflow is a *script*, not prose in a guide: `uv run` guarantees the
# project venv (a system Python is missing the optional deps, which shows up as a wall of
# collection errors unrelated to your change), and the noqa watch enforces "fix it, don't
# silence it".
set -euo pipefail
cd "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# CI installs `--extra test`; this script never did, so it depended on whatever the venv happened to contain. A plain
# `uv sync` (no extras) removes pytest-asyncio, and the gate then fails with a collection error that has nothing to do
# with the change — which is how "it passed 30 minutes ago" turns into an afternoon.
uv sync --extra test --quiet

status=0

echo "→ ruff"
uv run ruff check app tests || status=1

echo "→ no suppressions"
# A `# noqa` is a claim that the rule is wrong; that should be a review decision, not a
# drive-by. The allowlist is exactly one module: `app/services/platform/boundaries.py` owns the single
# blanket `except Exception`-by-design (see its docstring) that SSE streams, health probes and
# worker tasks route through, so every other module names the failures it expects.
NOQA_ALLOW='app/services/platform/boundaries.py'
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  if ! grep -qxF "$file" <<<"$NOQA_ALLOW"; then
    echo "check-backend: $hit silences a rule with noqa; fix the finding instead" >&2
    status=1
  fi
done < <(rg -n --no-heading '#\s*noqa' app tests --glob '*.py' || true)

echo "→ api doc routes"
# The reference must not describe a route the app lacks (always a failure), and may not fall further
# behind than scripts/api-doc-baseline.txt allows (a ratchet that only shrinks).
uv run python scripts/check_api_doc.py || status=1

echo "→ import cycles (ratchet)"
uv run python scripts/check_import_cycles.py || status=1

echo "→ doc paths"
# A path in the docs that no longer exists reads fine and links fine; only a machine notices.
uv run python scripts/check_doc_paths.py || status=1

echo "→ pytest"
uv run pytest -q || status=1

if [ "$status" -eq 0 ]; then
  echo "check-backend: OK"
fi
exit "$status"
