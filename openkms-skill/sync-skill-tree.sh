#!/usr/bin/env bash
# Copy runtime skill files (used by install.sh and package.sh).
# Excludes repo tooling (install.sh, package.sh, sync-skill-tree.sh) and local dev artifacts.
sync_skill_tree() {
  local src="${1:?source dir}"
  local dest="${2:?dest dir}"
  mkdir -p "$dest"
  rsync -a \
    --exclude='config.yml' \
    --exclude='.git/' \
    --exclude='dist/' \
    --exclude='tests/' \
    --exclude='dev-requirements.txt' \
    --exclude='package.sh' \
    --exclude='install.sh' \
    --exclude='sync-skill-tree.sh' \
    --exclude='__pycache__/' \
    --exclude='.pytest_cache/' \
    --exclude='*.pyc' \
    "${src}/" "${dest}/"
}
