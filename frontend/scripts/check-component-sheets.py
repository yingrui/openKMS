#!/usr/bin/env python3
"""Guardrail: a component's stylesheet must be imported by a component beside it.

The third shape of the same mistake this codebase keeps making (a rename, a move, a deletion — and
now a *creation*): `ChipPicker.scss` was written, the component was written, and nothing imported the
sheet. The checks passed, the build passed, and every `.chip-picker*` class was defined in a file that
no bundle ever loaded — which is only visible in the built CSS.

A sheet in `src/components/**` belongs to a component in its own directory: one of them has to import
it. (Sheets elsewhere are imported by pages, which the shared-style rules already police.)

Usage (from frontend/): python3 scripts/check-component-sheets.py [--list]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
COMPONENTS = ROOT / "src" / "components"


def offenders() -> list[str]:
    out: list[str] = []
    for sheet in sorted(COMPONENTS.rglob("*.scss")):
        # The name alone: the import is written `'./Sidebar.scss'`, so a quoted match misses it.
        importers = [
            sibling
            for sibling in sheet.parent.glob("*.tsx")
            if sheet.name in sibling.read_text(errors="ignore")
        ]
        if not importers:
            out.append(f"{sheet.relative_to(ROOT)} is imported by no component beside it")
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
