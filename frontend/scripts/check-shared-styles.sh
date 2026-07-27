#!/usr/bin/env bash
# Guardrails for the shared style layer — run from frontend/ (npm run check:styles).
#
# A page must not borrow another page's stylesheet: anything used by two areas
# belongs in src/styles/ under a neutral name. The allowlists below are known
# debt, not permission — shrink them, do not grow them.
set -euo pipefail

cd "$(dirname "$0")/.."

status=0

report() {
  echo "check-shared-styles: $1" >&2
  status=1
}

# --- 1. Cross-page stylesheet imports -----------------------------------------
# Anything used by two areas belongs in src/styles/ under a neutral name.
# Keep this allowlist empty; do not re-introduce page→page SCSS imports.
CROSS_PAGE_ALLOW=''

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  short="${file#src/}"
  if ! grep -qxF "$short" <<<"$CROSS_PAGE_ALLOW"; then
    report "$hit imports another page's stylesheet; move shared rules to src/styles/"
  fi
done < <(rg -n --no-heading "import '\.\./[a-z-]+/[A-Za-z]+\.scss'" src/pages --glob '*.tsx' || true)

# --- 2. Viewport checks in JS -------------------------------------------------
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  report "$hit calls matchMedia directly; use useIsMobile() from src/hooks/useIsMobile.ts"
done < <(rg -n --no-heading 'matchMedia' src --glob '*.ts' --glob '*.tsx' -g '!src/hooks/useIsMobile.ts' -g '!**/*.test.ts' -g '!**/*.test.tsx' -g '!**/*.spec.ts' -g '!**/*.spec.tsx' || true)

# --- 3. Magic-pixel breakpoints in SCSS ---------------------------------------
# Allowlisted until these pages move onto tokens (1050px has no token yet).
PX_MEDIA_ALLOW='src/pages/function-editor/function-editor.scss
src/pages/console/ConsoleAccessGroups.scss
src/pages/ontology/ontology-admin.scss'

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  if ! grep -qxF "$file" <<<"$PX_MEDIA_ALLOW"; then
    report "$hit uses a raw px breakpoint; use @include max-width(ds.\$bp-*) from _mixins.scss"
  fi
done < <(rg -n --no-heading '@media[^{]*[0-9]+px' src --glob '*.scss' || true)

# --- 4. Row actions rendered once ---------------------------------------------
# Mobile and desktop placements must share one element, not two JSX copies.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  count="${hit##*:}"
  if [ "$count" -gt 1 ]; then
    report "$file renders <TableRowActions> $count times; build it once and place it with useIsMobile()"
  fi
done < <(rg -c '<TableRowActions' src --glob '*.tsx' || true)

if [ "$status" -eq 0 ]; then
  echo "check-shared-styles: OK"
fi
exit "$status"
