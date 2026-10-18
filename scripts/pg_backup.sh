#!/usr/bin/env bash
# Back up the openKMS database, using the app's own settings for the connection.
#
#   scripts/pg_backup.sh [--out DIR] [--keep N]
#
# `pg_dump -Fc` (custom format: restorable table-by-table, compressed) — the format `restore_drill.sh`
# expects. Credentials come from `backend/.env` through `app.config`, so there is one source of truth for
# the connection and no DSN in a shell history.
#
# Requires the PostgreSQL client tools (`pg_dump`). They are **not** part of the Python environment; on
# macOS: `brew install libpq` and add its `bin/` to PATH. The script says so instead of failing obscurely.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"

OUT="$ROOT/backups"
KEEP=14
while [ $# -gt 0 ]; do
  case "$1" in
    --out) OUT="${2:?--out needs a directory}"; shift 2 ;;
    --keep) KEEP="${2:?--keep needs a number}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if ! command -v pg_dump >/dev/null 2>&1; then
  cat >&2 <<'MSG'
pg_backup.sh: pg_dump not found.

Install the PostgreSQL client tools and put them on PATH:
  macOS:  brew install libpq && export PATH="$(brew --prefix libpq)/bin:$PATH"
  Debian: apt-get install postgresql-client
MSG
  exit 1
fi

mkdir -p "$OUT"
DSN="$(cd backend && uv run python -c 'from app.config import settings; print(settings.database_url_sync)')"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT/openkms-$STAMP.dump"

echo "→ pg_dump → $FILE"
# -Fc: custom format. No --no-owner: the dump is meant to restore into a database with the same roles.
pg_dump --format=custom --file="$FILE" --dbname="$DSN"

# Keep the newest $KEEP dumps; a backup directory nobody prunes becomes a disk-full incident.
ls -1t "$OUT"/openkms-*.dump 2>/dev/null | tail -n "+$((KEEP + 1))" | while read -r old; do
  echo "→ prune $old"
  rm -f "$old"
done

echo "ok: $FILE ($(du -h "$FILE" | cut -f1))"
