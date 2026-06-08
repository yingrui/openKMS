"""Content hash for agent skill packages."""

from __future__ import annotations

import hashlib
from pathlib import Path


def _should_skip(path: Path, root: Path) -> bool:
    rel = path.relative_to(root).as_posix()
    if rel.startswith("__MACOSX/"):
        return True
    if path.name == ".DS_Store":
        return True
    return False


def compute_content_hash(skill_root: Path) -> str:
    """SHA-256 of concatenated per-file SHA-256 digests (files sorted by relative path)."""
    digests: list[str] = []
    for path in sorted(skill_root.rglob("*"), key=lambda p: p.relative_to(skill_root).as_posix()):
        if not path.is_file() or _should_skip(path, skill_root):
            continue
        digests.append(hashlib.sha256(path.read_bytes()).hexdigest())
    return hashlib.sha256("".join(digests).encode()).hexdigest()
