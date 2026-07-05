#!/usr/bin/env bash
# Suite app order guardrails — run from frontend/ (npm run check:app-modules).
set -euo pipefail

cd "$(dirname "$0")/.."

fail() {
  echo "check-app-modules: $1" >&2
  exit 1
}

grep -q 'useVisibleMainSidebarModules' src/components/Layout/Sidebar.tsx \
  || fail "Sidebar must use useVisibleMainSidebarModules (canonical App Rail order)"

grep -q 'useVisibleLauncherModules' src/components/Layout/AppLauncher.tsx \
  || fail "AppLauncher must use useVisibleLauncherModules"

grep -q 'useVisibleLauncherModules' src/pages/Home.tsx \
  || fail "Home Apps must use useVisibleLauncherModules (same order as Launcher)"

grep -q 'order: number' src/config/appModules.ts \
  || fail "appModules.ts must define order on AppModule"

grep -q 'sortSuiteApps' src/config/appModules.ts \
  || fail "appModules.ts must export sortSuiteApps"

if ! grep -q 'sortSuiteApps' src/hooks/useAppModules.ts; then
  fail "useAppModules must sort via sortSuiteApps"
fi

echo "check-app-modules: OK"
