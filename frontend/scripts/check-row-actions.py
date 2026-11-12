#!/usr/bin/env python3
"""Guardrail: a page must not invent its own table row-actions cell.

The design system owns it — `TableRowActionCell` (`width: 1%; nowrap`), `TableRowActions`,
`TableRowActionButton`, from `styles/design-system`. A page-local copy cannot know what the cell will
hold: `.eval-items-actions-col` was 80px, right for two icon buttons, and the runs table put a labelled
button plus an icon in the same class, so its actions ran off the right edge with no scrollbar to say so.
One cell in one place is what keeps that from recurring.

Allowed: `src/styles/**` (shared sheets, loaded by every route). Blocked: page and component sheets,
which ship in one route's chunk and are the ones that get reused by accident.

Usage (from frontend/): python3 scripts/check-row-actions.py [--list|--update-baseline]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "row-actions-baseline.txt"

#: Local cell/action-group classes: `<thing>-actions-col`, `<thing>-row-actions`, `<thing>-actions-cell`.
ACTIONS_CLASS = re.compile(r"\.([a-zA-Z0-9_-]*(?:actions?-col|row-actions|actions?-cell)[a-zA-Z0-9_-]*)")
#: Shared sheets are allowed to own shared looks; anything else is a page-local copy.
ALLOWED_PREFIXES = ("styles/",)


def scan() -> dict[str, set[str]]:
    hits: dict[str, set[str]] = {}
    for path in sorted(SRC.rglob("*.scss")):
        rel = path.relative_to(SRC).as_posix()
        if rel.startswith(ALLOWED_PREFIXES):
            continue
        text = path.read_text(errors="ignore")
        for match in ACTIONS_CLASS.finditer(text):
            hits.setdefault(rel, set()).add(match.group(1))
    return hits


def read_baseline() -> dict[str, int]:
    if not BASELINE.exists():
        return {}
    counts: dict[str, int] = {}
    for line in BASELINE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        path, _, count = line.rpartition(" ")
        counts[path] = int(count)
    return counts


def write_baseline(hits: dict[str, set[str]]) -> None:
    lines = [
        "# Page-local table row-actions cells — accepted debt, not permission.",
        "# Each one is a copy of what TableRowActionCell/TableRowActions already do; this file only shrinks.",
    ]
    lines += [f"{path} {len(classes)}" for path, classes in hits.items()]
    BASELINE.write_text("\n".join(lines) + "\n")


def main() -> int:
    hits = scan()
    if "--list" in sys.argv:
        for path, classes in hits.items():
            print(f"{path}: {', '.join(sorted(classes))}")
    if "--update-baseline" in sys.argv:
        write_baseline(hits)
        print(f"check-row-actions: baseline written ({len(hits)} file(s))")
        return 0

    baseline = read_baseline()
    status = 0
    for path, classes in hits.items():
        allowed = baseline.get(path, 0)
        if len(classes) > allowed:
            print(
                f"check-row-actions: {path} defines its own row-actions cell "
                f"({', '.join(sorted(classes))}); use TableRowActionCell / TableRowActions "
                f"from styles/design-system",
                file=sys.stderr,
            )
            status = 1
    if status == 0:
        print(f"check-row-actions: OK ({len(hits)} frozen)")
    return status


if __name__ == "__main__":
    sys.exit(main())
