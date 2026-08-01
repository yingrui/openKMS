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
# Prefer tokens via @include max-width(ds.$bp-*). Keep this allowlist empty.
PX_MEDIA_ALLOW=''

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  if ! grep -qxF "$file" <<<"$PX_MEDIA_ALLOW"; then
    report "$hit uses a raw px breakpoint; use @include max-width(ds.\$bp-*) from _mixins.scss"
  fi
done < <(rg -n --no-heading '@media[^{]*[0-9]+px' src --glob '*.scss' || true)

# Mixin form: @include max-width(900px) — also banned outside tokens.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  report "$hit uses @include max/min-width with a raw px value; pass ds.\$bp-* / ds.\$km-layout-max"
done < <(rg -n --no-heading '@include (max|min)-width\(\s*[0-9]+px' src --glob '*.scss' || true)

# --- 4. JS / Sass mobile breakpoint stay in sync ------------------------------
sass_bp=$(rg -oN '\$bp-md-min:\s*([0-9]+)px' src/styles/design-system/_tokens.scss --replace '$1' | head -1)
js_bp=$(rg -oN 'MOBILE_BREAKPOINT_PX\s*=\s*([0-9]+)' src/hooks/useIsMobile.ts --replace '$1' | head -1)
if [ -z "$sass_bp" ] || [ -z "$js_bp" ]; then
  report "could not parse \$bp-md-min ($sass_bp) or MOBILE_BREAKPOINT_PX ($js_bp)"
elif [ "$sass_bp" != "$js_bp" ]; then
  report "MOBILE_BREAKPOINT_PX ($js_bp) must equal \$bp-md-min ($sass_bp) in _tokens.scss"
fi

# --- 5. Row actions rendered once ---------------------------------------------
# Build <TableRowActions> once per row; place via CSS (channel-item-actions), not two JSX copies.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  count="${hit##*:}"
  if [ "$count" -gt 1 ]; then
    report "$file renders <TableRowActions> $count times; build it once and place it in .channel-item-actions"
  fi
done < <(rg -c '<TableRowActions' src --glob '*.tsx' || true)

# --- 6. Table wrap classes ----------------------------------------------------
# Prefer .ds-table-wrap. Allowlist is known debt, not permission — shrink it.
TABLE_WRAP_ALLOW='src/styles/design-system/_table-wrap.scss
src/styles/_channel-table-as-cards.scss
src/components/ResourceSharePanel.scss
src/pages/evaluation/EvaluationDatasetDetail.scss'

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  if ! grep -qxF "$file" <<<"$TABLE_WRAP_ALLOW"; then
    report "$hit defines a *-table-wrap; use .ds-table-wrap from styles/design-system/_table-wrap.scss"
  fi
done < <(rg -n --no-heading '\.[a-z0-9-]*table-wrap(per)?\s*\{' src --glob '*.scss' || true)

# --- 7. Modal / dialog overlay classes ----------------------------------------
# Prefer <Dialog> + .ds-dialog-overlay. Allowlist is known debt — shrink it.
OVERLAY_ALLOW='src/styles/design-system/_dialog.scss
src/pages/wiki/WikiSpaceSettings.scss'

while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  if ! grep -qxF "$file" <<<"$OVERLAY_ALLOW"; then
    report "$hit defines a *-modal-overlay / *-dialog-overlay; use <Dialog> from styles/design-system"
  fi
done < <(rg -n --no-heading '\.[a-z0-9-]*(modal|dialog)-overlay\s*\{' src --glob '*.scss' || true)

# --- 8. window.confirm --------------------------------------------------------
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  report "$hit uses window.confirm; use useConfirm() from contexts/ConfirmContext.tsx"
done < <(rg -n --no-heading 'window\.confirm\s*\(' src --glob '*.ts' --glob '*.tsx' || true)

# --- 9. Raw rgba overlay backdrops --------------------------------------------
# Overlay backgrounds must use var(--overlay-backdrop). Allowlist: token source only.
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  file="${hit%%:*}"
  case "$file" in
    src/styles/design-system/_css-variables.scss) continue ;;
  esac
  report "$hit uses raw rgba backdrop; use var(--overlay-backdrop)"
done < <(rg -n --no-heading 'background:\s*rgba\(\s*0\s*,\s*0\s*,\s*0' src --glob '*.scss' || true)


# --- 10. Large page TSX files -------------------------------------------------
# Soft limit 700 lines. Allowlist is known debt — shrink it, do not grow it.
PAGE_LINE_LIMIT=700
PAGE_SIZE_ALLOW='src/pages/knowledge-bases/KnowledgeBaseDetail.tsx
src/pages/knowledge-bases/useKnowledgeBaseDetail.ts
src/pages/console/ConsolePermissionManagement.tsx
src/pages/articles/ArticleDetail.tsx
src/pages/documents/DocumentChannel.tsx
src/pages/wiki/WikiSpaceSettings.tsx
src/pages/knowledge-map/KnowledgeMap.tsx
src/pages/knowledge-map/KnowledgeMapHtmlCopilot.tsx
src/pages/documents/DocumentDetail.infoPanel.tsx
src/pages/documents/useDocumentDetail.tsx
src/pages/ontology/ObjectExplorer.tsx
src/pages/evaluation/EvaluationDatasetDetail.tsx
src/pages/ontology/ObjectTypesPage.tsx
src/pages/console/ConsoleAccessGroups.tsx
src/pages/ontology/LinkTypesPage.tsx
src/contexts/AuthContext.tsx'

while IFS= read -r file; do
  [ -z "$file" ] && continue
  lines=$(wc -l < "$file" | tr -d ' ')
  if [ "$lines" -gt "$PAGE_LINE_LIMIT" ]; then
    if ! grep -qxF "$file" <<<"$PAGE_SIZE_ALLOW"; then
      report "$file has $lines lines (limit $PAGE_LINE_LIMIT); split like DocumentDetail (useX / .modals / .splitPanel) — see docs/design-system.md"
    fi
  fi
done < <(find src/pages src/contexts src/components -name '*.tsx' -o -name '*.ts' 2>/dev/null | grep -v '\.test\.' | grep -v '\.spec\.' || true)

if [ "$status" -eq 0 ]; then
  echo "check-shared-styles: OK"
fi
exit "$status"
