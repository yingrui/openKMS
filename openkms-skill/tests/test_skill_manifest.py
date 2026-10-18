"""The skill's manifest has to satisfy the loader and its own links.

`SKILL.md`'s `description` is what makes the skill load at the right moment, and the loader refuses one
over 1024 characters — which is how a 1270-character description silently disabled the whole skill. The
reference links are the other half: renaming `references/dashboards.md` to `stories.md` left `SKILL.md`
pointing at a file that no longer exists, and nothing failed until a reader tried to open it.
"""
from __future__ import annotations

import re
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
SKILL_MD = ROOT / "SKILL.md"
DESCRIPTION_LIMIT = 1024


def frontmatter() -> dict:
    text = SKILL_MD.read_text()
    return yaml.safe_load(text.split("---")[1])


def test_description_fits_the_loader_limit():
    description = frontmatter()["description"]
    assert len(description) <= DESCRIPTION_LIMIT, (
        f"{len(description)} chars > {DESCRIPTION_LIMIT}: the loader would refuse the skill"
    )


def test_name_is_the_command_the_body_uses():
    assert frontmatter()["name"] == "openkms"


def test_every_reference_it_names_exists():
    text = SKILL_MD.read_text()
    named = set(re.findall(r"references/[A-Za-z0-9._-]+\.md", text))
    assert named, "no reference links found — did the format change?"
    missing = sorted(p for p in named if not (ROOT / p).exists())
    assert not missing, f"SKILL.md points at missing files: {missing}"


def test_every_reference_file_is_linked():
    """The mirror check: a reference nobody links is a reference the agent will never read."""
    text = SKILL_MD.read_text()
    unlinked = sorted(
        f"references/{p.name}" for p in (ROOT / "references").glob("*.md") if f"references/{p.name}" not in text
    )
    assert not unlinked, f"reference files not linked from SKILL.md: {unlinked}"
