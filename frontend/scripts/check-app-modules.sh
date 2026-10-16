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

grep -q 'useVisibleLauncherModules' src/pages/Home.tsx \
  || fail "Home Apps must use useVisibleLauncherModules (same order as the App Rail)"

# The header launcher is gone, so anything marked `showInLauncher` must also be in the App Rail —
# otherwise that app is reachable from nowhere. (It was the launcher's whole content.)
python3 - <<'PYCHECK'
import re, pathlib, sys
config = pathlib.Path("src/config/appModules.ts").read_text()
orphans = []
for match in re.finditer(r"\{\s*id: '([\w-]+)',(.*?)\n  \},", config, re.S):
    module_id, block = match.group(1), match.group(2)
    in_launcher = re.search(r"showInLauncher: true", block)
    in_rail = re.search(r"showInMainSidebar: true", block)
    if in_launcher and not in_rail:
        orphans.append(module_id)
if orphans:
    print(f"check-app-modules: {', '.join(orphans)} would be unreachable (showInLauncher without showInMainSidebar)", file=sys.stderr)
    sys.exit(1)
PYCHECK

grep -q 'order: number' src/config/appModules.ts \
  || fail "appModules.ts must define order on AppModule"

grep -q 'sortSuiteApps' src/config/appModules.ts \
  || fail "appModules.ts must export sortSuiteApps"

if ! grep -q 'sortSuiteApps' src/hooks/useAppModules.ts; then
  fail "useAppModules must sort via sortSuiteApps"
fi

echo "check-app-modules: OK"
