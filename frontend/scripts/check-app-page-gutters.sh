#!/usr/bin/env bash
# Guardrails for App shell gutters — run from frontend/ (npm run check:app-layout).
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "check-app-page-gutters: $1" >&2
  exit 1
}

grep -q 'channel-section-layout__main app-page-pane' src/components/channels/ChannelSectionLayout.tsx \
  || fail "ChannelSectionLayout.tsx must use class app-page-pane on __main"

grep -q 'ontology-section-layout__main app-page-pane' src/components/Layout/MainLayout.tsx \
  || fail "MainLayout.tsx must use class app-page-pane on ontology __main"

if grep -E 'channel-section-layout__main' src/components/channels/ChannelSectionLayout.scss | grep -q 'padding:'; then
  fail "ChannelSectionLayout.scss must not set padding on __main (use .app-page-pane)"
fi

if grep -A5 'ontology-section-layout__main' src/App.scss 2>/dev/null | grep -q 'padding:'; then
  fail "App.scss must not set padding on ontology-section-layout__main (use .app-page-pane)"
fi

if grep '\.app-content' src/App.scss | grep 'space-8' | grep -q 'padding'; then
  fail "App.scss .app-content must use --app-page-padding-* tokens, not --space-8"
fi

echo "check-app-page-gutters: OK"
