#!/usr/bin/env bash
# Install this skill for OpenCode: copies this directory to ~/.config/opencode/skills/openkms
# Preserves an existing config.yml in DEST so local API keys are not wiped on reinstall.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${HOME}/.config/opencode/skills/openkms"
CONFIG_BACKUP=""
if [[ -f "${DEST}/config.yml" ]]; then
  CONFIG_BACKUP="$(mktemp)"
  cp "${DEST}/config.yml" "${CONFIG_BACKUP}"
fi
mkdir -p "$(dirname "$DEST")"
rm -rf "${DEST}"
cp -R "${ROOT}" "${DEST}"
if [[ -n "${CONFIG_BACKUP}" ]]; then
  mv "${CONFIG_BACKUP}" "${DEST}/config.yml"
  echo "Restored existing ${DEST}/config.yml"
fi
echo "openkms skill installed to ${DEST}"
echo "Optional: pip install -r ${DEST}/requirements.txt"
