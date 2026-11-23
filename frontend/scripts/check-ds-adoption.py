#!/usr/bin/env python3
"""Guardrail: how much of a page is the design system, and how much is its own skin.

Whether a page "follows the design system" is not a matter of taste and not visible in a screenshot — two pages
can look identical while one borrows the app's primitives and the other re-implements them. What differs is
*where the values come from*, and that is countable:

* **tokens** — a page's own sheet must not state colours. `#f8fafc` and `rgba(0, 0, 0, 0.1)` are the tell: the
  design system has `--color-*` and `--shadow-*`, and a literal is a value that the next theme change cannot
  reach. That is exactly how Object Explorer's canvas stayed light in dark mode.
* **primitives** — a page that imports `ListPage` / `Pagination` / `Loading` / `EmptyState` shares the widget;
  one that writes its own pager beside them has two implementations to keep in step.
* **re-skinning** — a page sheet that styles `table`, `th`, `td`, `button`, `select`, `input` or `textarea` is
  painting over a primitive that already has a skin.

The report is the point: it prints every page with those numbers, so "is this page on the design system?" is
answered with a row instead of an opinion. The only hard failure is the ratchet — colour literals are frozen per
file and may only shrink (`--update-baseline` rewrites it).

Usage: check-ds-adoption.py [--list] [--update-baseline]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = ROOT / "scripts" / "ds-adoption-baseline.txt"

COLOUR_LITERAL = re.compile(r"#[0-9a-fA-F]{3,8}\b|rgba?\(")
PRIMITIVE_NAME = re.compile(r"\b(ListPage|Pagination|Loading|EmptyState|FormField|Dialog|ListToolbar|SearchField|FilterSelect|EmptyState|StatusChip|TableRowActions|PanelToolbar)\b")
DS_CLASS = re.compile(r"\bds-[a-z][a-z0-9_-]*")
#: Selectors that repaint a primitive's own skin.
RESKIN = re.compile(
    r"^(?:[^{},]*\s)?(?:table|thead|tbody|tr|th|td|button|select|input|textarea)\b", re.M
)


def page_sheets() -> list[Path]:
    """Page and component sheets — everything that is not the design system itself."""
    return sorted(
        path
        for path in SRC.rglob("*.scss")
        if "design-system" not in path.parts
    )


def component_for(sheet: Path) -> Path | None:
    return sheet.with_suffix(".tsx") if sheet.with_suffix(".tsx").exists() else None


def audit(sheet: Path) -> dict[str, object]:
    css = sheet.read_text()
    tsx = component_for(sheet)
    source = tsx.read_text() if tsx else ""
    literals = len(COLOUR_LITERAL.findall(css))
    reskins = sum(1 for m in RESKIN.finditer(css))
    primitives = sorted(set(PRIMITIVE_NAME.findall(source)))
    return {
        "page": str(sheet.relative_to(SRC)),
        "literals": literals,
        "reskins": reskins,
        "primitives": len(primitives),
        "primitives_named": ",".join(primitives),
        "ds_classes": len(set(DS_CLASS.findall(source))),
        "css_rules": css.count("{"),
    }


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


def write_baseline(rows: list[dict[str, object]]) -> None:
    lines = [
        "# Colour literals in page sheets, frozen so they can only shrink.",
        "# A colour literal is a value the theme cannot reach — use --color-* / --shadow-*.",
        "# Regenerate: python3 scripts/check-ds-adoption.py --update-baseline",
    ]
    lines += [f"{row['page']} {row['literals']}" for row in rows if row["literals"]]
    BASELINE.write_text("\n".join(lines) + "\n")


def main() -> int:
    rows = [audit(sheet) for sheet in page_sheets()]
    rows.sort(key=lambda row: (-int(row["literals"]), str(row["page"])))

    if "--update-baseline" in sys.argv:
        write_baseline(rows)
        print(f"check-ds-adoption: baseline written ({sum(1 for r in rows if r['literals'])} files)")
        return 0

    if "--list" in sys.argv:
        print(f"{'sheet':56} {'colours':>7} {'re-skins':>8} {'prims':>5} {'ds类':>5}")
        for row in rows:
            print(
                f"{str(row['page'])[:54]:56} {row['literals']:>7} {row['reskins']:>8} "
                f"{row['primitives']:>5} {row['ds_classes']:>5}"
            )

    baseline = load_baseline()
    grown = [
        f"{row['page']}: {row['literals']} colour literals (frozen at {baseline.get(str(row['page']), 0)})"
        for row in rows
        if row["literals"] > baseline.get(str(row["page"]), 0)
    ]
    if grown:
        for line in grown:
            print(line)
        print(
            f"check-ds-adoption: {len(grown)} sheet(s) above their frozen colour-literal count — "
            "use the design-system tokens (--color-*, --shadow-*)",
            file=sys.stderr,
        )
        return 1

    total = sum(int(row["literals"]) for row in rows)
    print(f"check-ds-adoption: OK ({total} colour literals in {sum(1 for r in rows if r['literals'])} sheets, frozen)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
