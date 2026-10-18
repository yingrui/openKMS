#!/usr/bin/env bash
# Prove a backup restores: load the newest dump into a scratch database, compare it with the live one, drop it.
#
#   scripts/restore_drill.sh [--dump FILE]
#
# A backup that has never been restored is a hypothesis. This restores into `openkms_drill` (never the live
# database), compares row counts on a few tables that would break loudly if the dump were truncated, and
# removes the scratch database again. Both databases must be on the same server, which is the normal case.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"
DRILL_DB="openkms_drill"

DUMP=""
while [ $# -gt 0 ]; do
  case "$1" in
    --dump) DUMP="${2:?--dump needs a file}"; shift 2 ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

for tool in pg_restore createdb dropdb psql; do
  command -v "$tool" >/dev/null 2>&1 || { echo "restore_drill.sh: $tool not found (install the PostgreSQL client tools)" >&2; exit 1; }
done

[ -n "$DUMP" ] || DUMP="$(ls -1t "$ROOT"/backups/openkms-*.dump 2>/dev/null | head -1)"
[ -n "$DUMP" ] && [ -f "$DUMP" ] || { echo "restore_drill.sh: no dump found (run scripts/pg_backup.sh first)" >&2; exit 1; }

LIVE_DSN="$(cd backend && uv run python -c 'from app.config import settings; print(settings.database_url_sync)')"
DRILL_DSN="${LIVE_DSN%/*}/$DRILL_DB"

TABLES=(datasets stories dashboards documents users security_permissions audit_events)

cleanup() { dropdb --if-exists --dbname="${LIVE_DSN%/*}/postgres" "$DRILL_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "→ restore $DUMP → $DRILL_DB"
createdb --dbname="${LIVE_DSN%/*}/postgres" "$DRILL_DB"
pg_restore --dbname="$DRILL_DSN" --no-owner "$DUMP" >/dev/null

status=0
for table in "${TABLES[@]}"; do
  live=$(psql --dbname="$LIVE_DSN" -tAc "select count(*) from $table" 2>/dev/null || echo "missing")
  drill=$(psql --dbname="$DRILL_DSN" -tAc "select count(*) from $table" 2>/dev/null || echo "missing")
  if [ "$live" = "$drill" ]; then
    printf "  ✓ %-22s %s\n" "$table" "$live"
  else
    printf "  ✗ %-22s live=%s restored=%s\n" "$table" "$live" "$drill"
    status=1
  fi
done

[ "$status" -eq 0 ] && echo "restore drill ok" || echo "restore drill FAILED" >&2
exit "$status"
