#!/bin/sh
# Seed openkms_ontology_sdk into the shared volume on first boot (empty named volume).
set -eu
SEED=/opt/ontology-sdk-seed
TARGET=/app/openkms_ontology_sdk
if [ ! -f "$TARGET/__init__.py" ]; then
  mkdir -p "$TARGET"
  cp -a "$SEED/." "$TARGET/"
fi
exec "$@"
