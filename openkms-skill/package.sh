#!/usr/bin/env bash
# Build a zip for openKMS Agents → Skills upload (SKILL.md at archive root).
#
# Usage:
#   ./package.sh                     # dist/openkms-<date>.zip
#   ./package.sh --version 1.0.0     # dist/openkms-1.0.0.zip
#   ./package.sh -o /tmp/openkms.zip # explicit output path
#
# Excludes local secrets, tests, and dev/cache artifacts. Upload the zip on
# Agents → Skills with skill_id "openkms" (or your chosen id) and the same version.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION=""
OUTPUT=""

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \?//'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version|-v)
      VERSION="${2:-}"
      shift 2
      ;;
    --version=*)
      VERSION="${1#*=}"
      shift
      ;;
    --output|-o)
      OUTPUT="${2:-}"
      shift 2
      ;;
    --output=*)
      OUTPUT="${1#*=}"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ROOT/SKILL.md" ]]; then
  echo "openkms-skill: SKILL.md not found in $ROOT" >&2
  exit 1
fi

if [[ -z "$VERSION" ]]; then
  VERSION="$(date +%Y%m%d)"
fi

if [[ -z "$OUTPUT" ]]; then
  mkdir -p "$ROOT/dist"
  OUTPUT="$ROOT/dist/openkms-${VERSION}.zip"
else
  mkdir -p "$(dirname "$OUTPUT")"
fi

OUTPUT="$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")"

STAGING="$(mktemp -d "${TMPDIR:-/tmp}/openkms-skill-pack.XXXXXX")"
cleanup() { rm -rf "$STAGING"; }
trap cleanup EXIT

# shellcheck source=sync-skill-tree.sh
source "${ROOT}/sync-skill-tree.sh"
sync_skill_tree "$ROOT" "$STAGING"

if [[ ! -f "$STAGING/SKILL.md" ]]; then
  echo "openkms-skill: staging copy missing SKILL.md" >&2
  exit 1
fi

rm -f "$OUTPUT"
(cd "$STAGING" && zip -rq "$OUTPUT" .)

echo "Created: $OUTPUT"
echo "Upload on Agents → Skills with skill_id openkms, version ${VERSION}."
