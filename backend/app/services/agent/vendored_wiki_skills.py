"""Load kfchou/wiki-skills SKILL.md content vendored at repo `third-party/wiki-skills/`."""

from __future__ import annotations

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

# backend/app/services/agent/ → repo root = parents[4]
_REPO_ROOT = Path(__file__).resolve().parents[4]
_SKILLS_DIR = _REPO_ROOT / "third-party" / "wiki-skills" / "skills"

# Strip YAML frontmatter (---…---) that Claude Code uses; keep body for the LLM.
_FRONTMATTER = re.compile(r"^---\s*\n.*?\n---\s*\n", re.DOTALL | re.MULTILINE)

_SKILL_ORDER: tuple[str, ...] = (
    "wiki-init",
    "wiki-ingest",
    "wiki-query",
    "wiki-lint",
    "wiki-update",
)


def _strip_frontmatter(md: str) -> str:
    t = md.strip()
    m = _FRONTMATTER.match(t)
    if m:
        return t[m.end() :].lstrip()
    return t


def load_vendored_wiki_skills_for_prompt() -> str:
    """Concatenate all vendored skills for inclusion in the wiki agent system prompt."""
    if not _SKILLS_DIR.is_dir():
        logger.warning("Vendored wiki-skills not found at %s", _SKILLS_DIR)
        return (
            "(Vendored wiki-skills are missing. Clone with "
            "`git subtree add --prefix=third-party/wiki-skills` from kfchou/wiki-skills.)"
        )
    parts: list[str] = []
    for name in _SKILL_ORDER:
        p = _SKILLS_DIR / name / "SKILL.md"
        if not p.is_file():
            logger.warning("Missing skill file: %s", p)
            continue
        try:
            raw = p.read_text(encoding="utf-8")
        except OSError as e:
            logger.warning("Could not read %s: %s", p, e)
            continue
        body = _strip_frontmatter(raw)
        parts.append(f"### Skill: {name}\n\n{body.strip()}\n")
    if not parts:
        return "(No vendored wiki-skills SKILL.md files were readable.)"
    return "\n---\n\n".join(parts)
