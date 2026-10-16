#!/usr/bin/env python3
"""Guardrail: a component's stylesheet must be imported by something.

The third shape of the same mistake this codebase keeps making (a rename, a move, a deletion — and
now a *creation*): `ChipPicker.scss` was written, the component was written, and nothing imported the
sheet. The checks passed, the build passed, and every `.chip-picker*` class was defined in a file that
no bundle ever loaded — which is only visible in the built CSS.

A sheet in `src/components/**` has to be imported *somewhere* under `src` — not necessarily by a
sibling (the app catalog's grid sheet is imported by the Home page). What every other check is blind to
is a sheet nothing imports at all: its rules are correct and no bundle loads them.

Usage (from frontend/): python3 scripts/check-component-sheets.py [--list]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPONENTS = ROOT / "src" / "components"


def offenders() -> list[str]:
    out: list[str] = []
    sources = [
        p for p in (ROOT / "src").rglob("*.ts*") if ".test." not in p.name and ".spec." not in p.name
    ]
    for sheet in sorted(COMPONENTS.rglob("*.scss")):
        # The name alone: an import reads `'./Sidebar.scss'`, so a quoted match would miss it.
        importers = [p for p in sources if sheet.name in p.read_text(errors="ignore")]
        if not importers:
            out.append(f"{sheet.relative_to(ROOT)} is imported nowhere under src/")
    return out


def main() -> int:
    found = offenders()
    if "--list" in sys.argv:
        for line in found:
            print(line)
    if found:
        for line in found:
            print(line)
        print(
            f"check-shared-styles: {len(found)} component stylesheet(s) above are never imported — "
            "the rules exist but no bundle loads them",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: component sheets OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
