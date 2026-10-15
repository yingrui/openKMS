#!/usr/bin/env python3
"""Guardrail: a button whose only content is an icon needs an accessible name.

Screen readers announce an icon-only `<button>` as "button" — and so does a keyboard user
tabbing through the UI. `aria-label` (or `title`) is the fix.

Usage: check-a11y-buttons.py [--list]
Exits 1 when an icon-only button has neither `aria-label` nor `title`.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

BUTTON = re.compile(r"<button\b[^>]*>(.*?)</button>", re.S)
ICON = re.compile(r"<[A-Z]\w*[^>]*/>|<svg")
# Anything that would be announced as text (letters/numbers, not just punctuation).
HAS_TEXT = re.compile(r"[A-Za-z0-9\u4e00-\u9fff]")


def offenders() -> list[str]:
    out: list[str] = []
    for path in sorted(SRC.rglob("*.tsx")):
        source = path.read_text(errors="ignore")
        for match in BUTTON.finditer(source):
            tag, inner = match.group(0), match.group(1)
            if "aria-label" in tag or "title=" in tag:
                continue
            if not ICON.search(inner):
                continue
            text = HAS_TEXT.search(re.sub(r"<[^>]+>", "", inner))
            if text:
                continue
            line = source.count("\n", 0, match.start()) + 1
            out.append(f"{path.relative_to(ROOT)}:{line}: {' '.join(tag.split())[:80]}")
    return out


def main() -> int:
    found = offenders()
    if "--list" in sys.argv or found:
        for line in found:
            print(line)
    if found:
        print(
            f"check-shared-styles: {len(found)} icon-only button(s) above have no accessible "
            "name — add aria-label (or title)",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: icon-only buttons OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
