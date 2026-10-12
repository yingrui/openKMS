#!/usr/bin/env bash
# Install this skill for OpenCode, Claude Code, and/or Pi Agent.
#
# Destinations:
#   - OpenCode:    ~/.config/opencode/skills/openkms
#   - Claude Code: ~/.claude/skills/openkms
#   - Pi Agent:    ~/.pi/agent/skills/openkms
#
# Usage:
#   ./install.sh                         # same as --target auto
#   ./install.sh --target auto           # install only where the runtime config dir
#                                        # already exists (~/.config/opencode, ~/.claude,
#                                        # and/or ~/.pi). If none exist, do nothing.
#   ./install.sh --target opencode       # OpenCode only
#   ./install.sh --target claude-code    # Claude Code only
#   ./install.sh --target pi             # Pi Agent only
#   ./install.sh --target all            # all three destinations (create dirs as needed)
#   ./install.sh --dest /custom/path     # explicit destination (overrides --target)
#
# A pre-existing config.yml at any destination is preserved across reinstalls.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OPENCODE_DEST="${HOME}/.config/opencode/skills/openkms"
CLAUDE_DEST="${HOME}/.claude/skills/openkms"
PI_DEST="${HOME}/.pi/agent/skills/openkms"

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
      sed -n '2,21p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
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
    pi)          echo "${PI_DEST}" ;;
    all)         printf '%s\n%s\n%s\n' "${OPENCODE_DEST}" "${CLAUDE_DEST}" "${PI_DEST}" ;;
    auto)
      local picked=()
      [[ -d "${HOME}/.config/opencode" ]] && picked+=("${OPENCODE_DEST}")
      [[ -d "${HOME}/.claude"          ]] && picked+=("${CLAUDE_DEST}")
      [[ -d "${HOME}/.pi"              ]] && picked+=("${PI_DEST}")
      if [[ ${#picked[@]} -eq 0 ]]; then
        echo "No OpenCode, Claude Code, or Pi config dir detected; doing nothing." >&2
        echo "  Use --target opencode|claude-code|pi|all or --dest <path>." >&2
        return
      fi
      printf '%s\n' "${picked[@]}"
      ;;
    *)
      echo "Invalid --target: ${TARGET} (expected: opencode|claude-code|pi|all|auto)" >&2
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

INSTALLED=0
while IFS= read -r dest; do
  [[ -z "${dest}" ]] && continue
  install_to "${dest}"
  INSTALLED=1
done < <(resolve_destinations)

if [[ "${INSTALLED}" -eq 1 ]]; then
  echo "Optional: pip install -r ${ROOT}/requirements.txt"
fi
