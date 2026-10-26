#!/usr/bin/env python3
"""A `ds-table-wrap` inside an `EntityViewPanel` must be `--flush`.

`EntityViewPanel` renders `.account-card`: background, border, `--radius-lg`, shadow and padding. A table wrap inside
it keeps its **own** border and radius, so the reader sees a rounded card inside a rounded card — the "two rounded
boxes" that made the file dataset's sample look like a different product from its neighbours.

`--flush` (border/radius/shadow: none) is the documented answer — "drop chrome when nested inside an outer card" — and
this check is one grep per nesting, so the next table added inside a panel cannot reintroduce it.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

PANEL = re.compile(r"<EntityViewPanel\b")
WRAP = re.compile(r'className="ds-table-wrap(?![^"]*--flush)')


def offenders() -> list[str]:
    out: list[str] = []
    for path in sorted(SRC.rglob("*.tsx")):
        if ".test." in path.name:
            continue
        text = path.read_text(errors="ignore")
        for match in PANEL.finditer(text):
            end = text.find("</EntityViewPanel>", match.start())
            if end == -1:
                continue
            block = text[match.start() : end]
            if WRAP.search(block):
                line = text.count("\n", 0, match.start()) + 1
                out.append(f"{path.relative_to(ROOT)}:{line}: a ds-table-wrap inside EntityViewPanel is missing --flush")
    return out


def main() -> int:
    found = offenders()
    if found:
        for line in found:
            print(line)
        print(
            f"check-shared-styles: {len(found)} table card(s) above sit inside a panel without `--flush` — "
            "two rounded boxes in one card",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: panel tables OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
