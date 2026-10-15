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

# Mobile must not re-stack gutters on rail + compact (document/article/media detail).
# Compact padding applies only when NOT a rail layout.
if ! grep -A8 'app-content--compact:not' src/App.scss | grep -q 'app-content--with-channel-rail'; then
  fail "App.scss mobile compact padding must exclude .app-content--with-channel-rail (pane owns gutter)"
fi

# Detail page roots must not add a second horizontal gutter on top of .app-page-pane.
if grep -E '^\.document-detail \{|^\.article-detail-page\.document-detail \{' -A6 src/styles/document-detail.scss src/pages/articles/ArticleDetail.scss \
  | grep -E 'padding:\s*0\s+var\(--space'; then
  fail "document/article detail root must not set horizontal padding (pane owns the gutter)"
fi

if grep '\.app-content' src/App.scss | grep 'space-8' | grep -q 'padding'; then
  fail "App.scss .app-content must use --app-page-padding-* tokens, not --space-8"
fi

# Data-layer entity detail: the pane must own the gutter and the shell must fill the window.
grep -q 'app-page-pane' src/components/Layout/PagePaneLayout.tsx \
  || fail "PagePaneLayout.tsx must render .app-page-pane (data-layer entity detail)"
grep -q '\.app-content:has(> \.app-page-pane > \.entity-view)' src/pages/ontology-manager/entity-view.scss \
  || fail "entity-view.scss must zero .app-content padding when the pane hosts the shell"
grep -q 'body:has(\.app-page-pane > \.entity-view) \.app-main' src/pages/ontology-manager/entity-view.scss \
  || fail "entity-view.scss must give the shell chain a window height (no rail marker on these routes)"
if ! grep -A 8 '\.app-content:has(> \.app-page-pane > \.entity-view)' src/pages/ontology-manager/entity-view.scss | grep -q 'display: flex'; then
  fail "entity-view.scss must make .app-content a flex column, or the pane never fills"
fi
if ! grep -A 5 'body:has(\.app-page-pane > \.entity-view) {' src/pages/ontology-manager/entity-view.scss | grep -q 'height: 100vh'; then
  fail "entity-view.scss must pin the document height for entity detail pages"
fi

echo "check-app-page-gutters: OK"
