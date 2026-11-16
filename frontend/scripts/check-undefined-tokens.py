#!/usr/bin/env python3
"""Fail when a stylesheet or a component uses `var(--token)` that nothing defines.

An undefined custom property is not an error the browser reports: `fill: var(--color-bg-surface)` on an SVG
shape falls back to **black**, `stroke` to none. That is how a graph turns black in a themed app without a
single warning.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "undefined-tokens-baseline.txt"

DEF = re.compile(r"(--[a-zA-Z0-9-]+)\s*:")
USE = re.compile(r"var\(\s*(--[a-zA-Z0-9-]+)(\s*,)?")
BLOCK_COMMENT = re.compile(r"/\*.*?\*/", re.S)


def defined() -> set[str]:
    names: set[str] = set()
    for path in SRC.rglob("*.scss"):
        names.update(DEF.findall(path.read_text(errors="ignore")))
    # A component may declare a custom property inline (`style={{ "--row-w": … }}`).
    for path in SRC.rglob("*.tsx"):
        names.update(re.findall(r"""["'](--[a-zA-Z0-9-]+)["']\s*:""", path.read_text(errors="ignore")))
    return names


def used() -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for pattern in ("*.scss", "*.tsx"):
        for path in SRC.rglob(pattern):
            if ".test." in path.name:
                continue
            text = BLOCK_COMMENT.sub("", path.read_text(errors="ignore"))
            for name, fallback in USE.findall(text):
                # A fallback makes the name optional on purpose (`var(--row-w, 100%)`).
                if fallback:
                    continue
                # `var(--color-#{$x})` / `var(--finding-series-${i})` are built at build time.
                if name.endswith("-"):
                    continue
                out.setdefault(name, set()).add(str(path.relative_to(ROOT)))
    return out


def main() -> int:
    known = defined()
    baseline: set[str] = set()
    if BASELINE.is_file():
        baseline = {
            line.strip()
            for line in BASELINE.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }
    missing = {name: files for name, files in used().items() if name not in known}
    new = sorted(name for name in missing if name not in baseline)
    if new:
        print("check-undefined-tokens: these `var(--…)` are defined nowhere — an invalid value falls back to")
        print("the property's initial value (black fill, no stroke), not to a theme colour:\n")
        for name in new:
            print(f"  {name}  <- {', '.join(sorted(missing[name]))}")
        print(f"\ncheck-undefined-tokens: {len(new)} undefined tokens (baseline {len(baseline)})")
        return 1
    print(f"check-undefined-tokens: OK (0 undefined, baseline {len(baseline)})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
