#!/usr/bin/env python3
"""Guardrail: a stylesheet must be imported by something — directly or through a Sass partial.

Two shapes of the same mistake this codebase keeps making (a rename, a move, a deletion — and now a
*creation*): `ChipPicker.scss` was written, the component was written, and nothing imported the sheet. The
checks passed, the build passed, and every `.chip-picker*` class was defined in a file that no bundle ever
loaded — which is only visible in the built CSS.

Then it happened again with `src/styles/metrics.scss`: the classes were used, the gates were green, and
every SVG `<rect>` in the metric dependency graph painted **black** — an unstyled rect has no fill and no
stroke. So the reachability check now covers `src/styles/**` too, and resolves Sass partials properly:
`@use './styles/design-system/dialog'` means `_dialog.scss` (or `dialog/_index.scss`), which a plain
"does this file name appear anywhere" grep cannot see.

Usage (from frontend/): python3 scripts/check-component-sheets.py [--list]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
CHECKED = (SRC / "components", SRC / "styles")

_TS_IMPORT = re.compile(r"""from\s+['"]([^'"]+\.scss)['"]|import\s+['"]([^'"]+\.scss)['"]""")
_SCSS_IMPORT = re.compile(r"""@(?:use|forward|import)\s+['"]([^'"]+)['"]""")


def _sources() -> list[Path]:
    # Explicit extensions: `*.ts*` also matches `X.tsx.bak`, and a stray copy that still names the sheet
    # would make an unimported stylesheet look imported.
    return [
        path
        for pattern in ("*.ts", "*.tsx")
        for path in SRC.rglob(pattern)
        if ".test." not in path.name and ".spec." not in path.name
    ]


def _resolve(base: Path, spec: str) -> Path | None:
    """Sass-style resolution: exact, `_partial.scss`, `dir/_index.scss`, `dir/index.scss`."""
    if spec.startswith(("sass:", "http:", "https:", "url(")):
        return None
    target = (base.parent / spec).resolve()
    candidates = [
        target,
        # Append, do not `with_suffix`: a Sass spec may contain a dot of its own
        # (`document-detail.print` names a file, and `with_suffix` would resolve it to
        # `document-detail.scss` — an edge that looks satisfied and loads the wrong sheet).
        target.parent / f"{target.name}.scss",
        target.parent / f"_{target.name}.scss",
        target / "_index.scss",
        target / "index.scss",
    ]
    for candidate in candidates:
        if candidate.is_file() and candidate.suffix == ".scss":
            return candidate
    return None


def reachable_sheets() -> set[Path]:
    """Sheets a bundle actually loads: TS imports are roots, Sass imports are edges."""
    loaded: set[Path] = set()
    queue: list[Path] = []

    for source in _sources():
        text = source.read_text(errors="ignore")
        for match in _TS_IMPORT.finditer(text):
            spec = match.group(1) or match.group(2)
            resolved = _resolve(source, spec)
            if resolved:
                queue.append(resolved)

    while queue:
        sheet = queue.pop()
        if sheet in loaded:
            continue
        loaded.add(sheet)
        for spec in _SCSS_IMPORT.findall(sheet.read_text(errors="ignore")):
            resolved = _resolve(sheet, spec)
            if resolved:
                queue.append(resolved)
    return loaded


def offenders() -> list[str]:
    loaded = reachable_sheets()
    out: list[str] = []
    for folder in CHECKED:
        for sheet in sorted(folder.rglob("*.scss")):
            # A Sass module barrel (`_index.scss` re-exporting tokens + mixins) emits no CSS, so an
            # unimported one cannot paint anything — it is a convenience, not a rule sheet.
            if sheet.name == "_index.scss":
                continue
            if sheet not in loaded:
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
            f"check-shared-styles: {len(found)} stylesheet(s) above are never imported — "
            "the rules exist but no bundle loads them (an unimported SVG rule paints black)",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: component sheets OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
