#!/usr/bin/env python3
"""Guardrail: a class used from two routes must not live in one route's stylesheet.

Vite ships a page's SCSS with that page's lazy chunk, so a class defined in
`pages/<area>/x.scss` and reused from another route silently loses its styles depending on
which page the visitor opened first (this is how the semantic-model page's Add buttons
shipped unstyled). Anything shared belongs in `src/styles/`.

Detection: collect the classes defined in **non-global** SCSS (everything outside
`src/styles/`, `App.scss`, `index.scss`), then flag those used from ≥2 route areas.
`scripts/global-classes-baseline.txt` freezes today's offenders — the check ratchets:
fixing them is always fine, adding one fails. Regenerate with `--update-baseline`.

Usage: check-global-classes.py [--list|--update-baseline]
"""
from __future__ import annotations

import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "global-classes-baseline.txt"
GLOBAL_FILES = {"App.scss", "index.scss"}

CLASS_DEF = re.compile(r"\.((?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*__)?[a-z][a-z0-9-]*)")
CLASSNAME = re.compile(r'className="([^"{}]+)"')


def is_global(scss: Path) -> bool:
    rel = scss.relative_to(SRC)
    return rel.parts[0] == "styles" or scss.name in GLOBAL_FILES


def area_of(path: Path) -> str:
    return "/".join(path.relative_to(SRC).parts[:2])


def defined_locally() -> dict[str, set[str]]:
    out: dict[str, set[str]] = collections.defaultdict(set)
    for scss in SRC.rglob("*.scss"):
        if is_global(scss):
            continue
        for name in set(CLASS_DEF.findall(scss.read_text(errors="ignore"))):
            out[name].add(str(scss.relative_to(SRC)))
    return out


def offenders() -> dict[str, set[str]]:
    owner = defined_locally()
    users: dict[str, set[str]] = collections.defaultdict(set)
    for tsx in SRC.rglob("*.tsx"):
        area = area_of(tsx)
        for token in CLASSNAME.findall(tsx.read_text(errors="ignore")):
            for name in token.split():
                if name in owner:
                    users[name].add(area)
    return {name: areas for name, areas in users.items() if len(areas) > 1}


def main() -> int:
    found = offenders()

    if "--update-baseline" in sys.argv:
        BASELINE.write_text(
            "# Classes used from 2+ routes but defined in one route's SCSS. Frozen so the\n"
            "# list only shrinks; move a class to src/styles/ and delete its line here.\n"
            + "".join(f"{name}\n" for name in sorted(found))
        )
        print(f"wrote {BASELINE.name}: {len(found)} shared-but-local classes")
        return 0

    baseline = set()
    if BASELINE.exists():
        baseline = {
            line.strip()
            for line in BASELINE.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }

    new = sorted(set(found) - baseline)
    if "--list" in sys.argv:
        for name in sorted(found):
            print(f".{name}  used by {sorted(found[name])}")
    if new:
        for name in new:
            print(f".{name}  used by {sorted(found[name])}")
        print(
            f"check-shared-styles: {len(new)} class(es) above are used from several routes "
            "but defined in one route's SCSS — move them to src/styles/",
            file=sys.stderr,
        )
        return 1
    print(f"check-shared-styles: shared-but-local classes OK ({len(baseline)} frozen)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
