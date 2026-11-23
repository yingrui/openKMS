#!/usr/bin/env python3
"""Guardrail: a page sheet that re-declares a skin the design system already owns.

The colour-literal check finds values the theme cannot reach; this one finds the quieter copy — the same
declarations under a different class name. `objects-card` was `.ds-resource-list-card` word for word (padding,
radius, shadow, hover border) and looked correct, so nothing failed: four cards existed and only one was the
design system's.

The test is a declaration match, not a name match:

* both blocks are read with nesting resolved (`&:hover` becomes `.card:hover`);
* a page block is a **copy** when at least four declarations are identical, they cover most of the page block,
  and at least two of them are *skin* properties (background, border, radius, shadow, padding, colour, font).

Reports are the useful part; the ratchet keeps the count per file from growing (files are frozen at their
current count and may only shrink, `--update-baseline` rewrites it).

Usage: check-ds-duplicates.py [--list] [--update-baseline]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
DS = SRC / "styles" / "design-system"
BASELINE = ROOT / "scripts" / "ds-duplicates-baseline.txt"

DECLARATION = re.compile(r"^\s*([a-z-]+)\s*:\s*(.+?);\s*$")
SKIN_PROPERTIES = {
    "background",
    "background-color",
    "color",
    "border",
    "border-color",
    "border-radius",
    "border-bottom",
    "border-top",
    "box-shadow",
    "padding",
    "padding-top",
    "padding-bottom",
    "padding-left",
    "padding-right",
    "font-size",
    "font-weight",
    "letter-spacing",
    "text-transform",
}
MIN_DECLARATIONS = 4
MIN_SKIN = 2
COVERAGE = 0.8


def blocks(css: str) -> dict[str, set[str]]:
    """`selector → its declarations`, with `&` nesting resolved."""
    out: dict[str, set[str]] = {}
    stack: list[str] = []
    buffer: list[str] = []
    for char in css:
        if char == "{":
            raw = "".join(buffer).strip()
            buffer = []
            parent = stack[-1] if stack else ""
            selectors = [s.strip() for s in raw.split(",") if s.strip()] or [""]
            resolved = [
                sel.replace("&", parent) if "&" in sel else (f"{parent} {sel}".strip() if parent else sel)
                for sel in selectors
            ]
            stack.append(resolved[0])
            for sel in resolved:
                out.setdefault(sel, set())
        elif char == "}":
            body = "".join(buffer)
            buffer = []
            if stack:
                group = stack.pop()
                for line in body.splitlines():
                    match = DECLARATION.match(line)
                    if match:
                        out.setdefault(group, set()).add(
                            f"{match.group(1)}: {match.group(2).strip()}"
                        )
        else:
            buffer.append(char)
    return {selector: decls for selector, decls in out.items() if decls}


def design_system_blocks(hidden: set[str]) -> dict[str, set[str]]:
    """Every declaration set the design system owns, merged so a match can name one path."""
    out: dict[str, set[str]] = {}
    for sheet in sorted(DS.glob("*.scss")):
        for selector, decls in blocks(_strip_comments(sheet.read_text())).items():
            out.setdefault(selector, set()).update(decls)
            out[selector] |= hidden & decls
    return out


def _strip_comments(css: str) -> str:
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    return re.sub(r"(^|\n)\s*//[^\n]*", r"\1", css)


def page_sheets() -> list[Path]:
    return sorted(p for p in SRC.rglob("*.scss") if "design-system" not in p.parts)


def find_copies(design: dict[str, set[str]], sheet: Path) -> list[tuple[str, str, int]]:
    found: list[tuple[str, str, int]] = []
    for selector, decls in blocks(_strip_comments(sheet.read_text())).items():
        if len(decls) < MIN_DECLARATIONS:
            continue
        best: tuple[str, int] | None = None
        for their_selector, their_decls in design.items():
            shared = decls & their_decls
            if len(shared) < MIN_DECLARATIONS:
                continue
            if len(shared) / len(decls) < COVERAGE:
                continue
            if len({d.split(":")[0] for d in shared} & SKIN_PROPERTIES) < MIN_SKIN:
                continue
            if best is None or len(shared) > best[1]:
                best = (their_selector, len(shared))
        if best:
            found.append((selector, best[0], best[1]))
    return found


def load_baseline() -> dict[str, int]:
    if not BASELINE.exists():
        return {}
    out: dict[str, int] = {}
    for line in BASELINE.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        path, count = line.rsplit(" ", 1)
        out[path] = int(count)
    return out


def main() -> int:
    design = design_system_blocks(set())
    rows = []
    for sheet in page_sheets():
        copies = find_copies(design, sheet)
        if copies:
            rows.append((str(sheet.relative_to(SRC)), copies))
    rows.sort(key=lambda row: -len(row[1]))

    if "--update-baseline" in sys.argv:
        lines = [
            "# Page rules that re-declare a design-system skin, frozen so they can only shrink.",
            "# Each entry is the number of copied blocks in that sheet.",
            "# Regenerate: python3 scripts/check-ds-duplicates.py --update-baseline",
        ]
        lines += [f"{path} {len(copies)}" for path, copies in rows]
        BASELINE.write_text("\n".join(lines) + "\n")
        print(f"check-ds-duplicates: baseline written ({len(rows)} sheets)")
        return 0

    if "--list" in sys.argv:
        for path, copies in rows:
            print(f"{path}")
            for selector, theirs, shared in copies:
                print(f"    {selector}  →  {theirs}  ({shared} declarations identical)")

    baseline = load_baseline()
    grown = [
        f"{path}: {len(copies)} copied block(s), frozen at {baseline.get(path, 0)}"
        for path, copies in rows
        if len(copies) > baseline.get(path, 0)
    ]
    if grown:
        for line in grown:
            print(line)
        print(
            f"check-ds-duplicates: {len(grown)} sheet(s) above their frozen count — "
            "use the design-system class, or extend it (run with --list to see the match)",
            file=sys.stderr,
        )
        return 1

    print(
        f"check-ds-duplicates: OK ({sum(len(c) for _, c in rows)} copied blocks in "
        f"{len(rows)} sheets, frozen)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
