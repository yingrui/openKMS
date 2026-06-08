#!/usr/bin/env bash
# Install this skill for OpenCode and/or Claude Code.
#
# Default (auto): install to whichever runtime dirs already exist on this machine.
#   - OpenCode:    ~/.config/opencode/skills/openkms
#   - Claude Code: ~/.claude/skills/openkms
# If neither dir exists, falls back to OpenCode and prints a hint.
#
# Usage:
#   ./install.sh                         # auto-detect
#   ./install.sh --target opencode       # OpenCode only
#   ./install.sh --target claude-code    # Claude Code only
#   ./install.sh --target both           # both runtimes
#   ./install.sh --dest /custom/path     # explicit destination (overrides --target)
#
# A pre-existing config.yml at any destination is preserved across reinstalls.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_DEST="${HOME}/.config/opencode/skills/openkms"
CLAUDE_DEST="${HOME}/.claude/skills/openkms"

TARGET="auto"
EXPLICIT_DEST=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --target=*)
      TARGET="${1#*=}"
      shift
      ;;
    --dest)
      EXPLICIT_DEST="${2:-}"
      shift 2
      ;;
    --dest=*)
      EXPLICIT_DEST="${1#*=}"
      shift
      ;;
    -h|--help)
      sed -n '2,16p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

resolve_destinations() {
  if [[ -n "${EXPLICIT_DEST}" ]]; then
    echo "${EXPLICIT_DEST}"
    return
  fi
  case "${TARGET}" in
    opencode)    echo "${OPENCODE_DEST}" ;;
    claude-code) echo "${CLAUDE_DEST}" ;;
    both)        printf '%s\n%s\n' "${OPENCODE_DEST}" "${CLAUDE_DEST}" ;;
    auto)
      local picked=()
      [[ -d "${HOME}/.config/opencode" ]] && picked+=("${OPENCODE_DEST}")
      [[ -d "${HOME}/.claude"          ]] && picked+=("${CLAUDE_DEST}")
      if [[ ${#picked[@]} -eq 0 ]]; then
        echo "No OpenCode or Claude Code config dir detected; defaulting to OpenCode." >&2
        echo "  (override with --target claude-code or --target both)" >&2
        picked=("${OPENCODE_DEST}")
      fi
      printf '%s\n' "${picked[@]}"
      ;;
    *)
      echo "Invalid --target: ${TARGET} (expected: opencode|claude-code|both|auto)" >&2
      exit 2
      ;;
  esac
}

install_to() {
  local dest="$1"
  local config_backup=""
  if [[ -f "${dest}/config.yml" ]]; then
    config_backup="$(mktemp)"
    cp "${dest}/config.yml" "${config_backup}"
  fi
  mkdir -p "$(dirname "${dest}")"
  rm -rf "${dest}"
  # shellcheck source=sync-skill-tree.sh
  source "${ROOT}/sync-skill-tree.sh"
  sync_skill_tree "${ROOT}" "${dest}"
  if [[ -n "${config_backup}" ]]; then
    mv "${config_backup}" "${dest}/config.yml"
    echo "Restored existing ${dest}/config.yml"
  fi
  echo "openkms skill installed to ${dest}"
}

while IFS= read -r dest; do
  [[ -z "${dest}" ]] && continue
  install_to "${dest}"
done < <(resolve_destinations)

echo "Optional: pip install -r ${ROOT}/requirements.txt"
