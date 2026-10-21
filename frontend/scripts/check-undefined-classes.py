#!/usr/bin/env python3
"""Guardrail: a class used in JSX must exist in some stylesheet.

Three times now a class has shipped that styles nothing, each time from a *mechanical* edit rather
than a design decision:

* `ExplorerChart` kept `className="explorer-chart"` while the sheet said `.report-chart` — the chart
  host silently lost its height (a rename's second half);
* the report views' styles lived in one page's sheet while another route rendered them (a move's
  other half);
* the narrative editor's styles were **cut by a line-range slice** while tidying a sheet — 82 lines
  removed by index, and the two blocks inside that range were not the ones being removed (this one,
  for a while, had no styling at all).

The detection is deliberately flat: a token used in a static `className="…"` is checked against every
class token any `*.scss` defines (plus `&__x` / `&-x` expansions and plain mentions, so a compound
selector counts). Interpolated class names are skipped, because their tokens are not decidable here.

Usage (from frontend/): python3 scripts/check-undefined-classes.py [--list|--update-baseline]
`undefined-classes-baseline.txt` holds accepted debt (104 classes that style nothing today); it only
shrinks.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "undefined-classes-baseline.txt"

CLASSNAME = re.compile(r'className="([^"{}]+)"')
SCSS_CLASS = re.compile(r"\.([a-zA-Z][a-zA-Z0-9_-]*)")
SCSS_NESTED = re.compile(r"&(__|-)([a-zA-Z0-9-]+)")
#: Bare state words are styling state, not component classes.
STATE_WORDS = {"active", "open", "selected", "disabled", "loading", "error", "danger", "hidden", "spin", "is-danger"}
#: Markup we do not own, styled by its own package.
FOREIGN_PREFIXES = ("a2ui-", "force-graph", "mermaid", "katex", "cm-", "recharts-", "rc-")


def defined_classes() -> set[str]:
    """Every class any sheet defines, including the `&__x` / `&-x` / `&--x` a nested block builds.

    The parent of a `&` is the class of the block it sits **in**, tracked by brace depth — not "the last
    class name seen", which is what this used to do: inside `.ds-table-wrap { … .ds-pagination { … } &
    --scroll { … } }` the last name seen was `ds-pagination`, so `ds-table-wrap--scroll` looked undefined
    and sat in the baseline as debt for a class that was styled all along.
    """
    out: set[str] = set()
    for sheet in SRC.rglob("*.scss"):
        text = sheet.read_text(errors="ignore")
        out |= set(SCSS_CLASS.findall(text))

        # base_of_block[depth] = the class that `&` refers to inside that block
        base_of_block: list[str | None] = [None]
        pending: str | None = None
        i = 0
        while i < len(text):
            char = text[i]
            if char == "{":
                base_of_block.append(pending or base_of_block[-1])
                pending = None
            elif char == "}":
                if len(base_of_block) > 1:
                    base_of_block.pop()
                pending = None
            elif char == "&":
                match = re.match(r"&(__|--|-)([a-zA-Z0-9-]+)", text[i:])
                if match and base_of_block[-1]:
                    out.add(f"{base_of_block[-1]}{match.group(1)}{match.group(2)}")
                    i += len(match.group(0))
                    continue
            elif char == ".":
                match = re.match(r"\.([a-zA-Z][a-zA-Z0-9_-]*)", text[i:])
                if match:
                    pending = match.group(1)
                    i += len(match.group(0))
                    continue
            i += 1
    return out


def offenders() -> list[str]:
    defined = defined_classes()
    out: list[str] = []
    for tsx in sorted(SRC.rglob("*.tsx")):
        if ".test." in tsx.name or ".spec." in tsx.name:
            continue
        used: set[str] = set()
        for match in CLASSNAME.finditer(tsx.read_text(errors="ignore")):
            used |= {token for token in match.group(1).split() if token}
        for name in sorted(used):
            if name in defined or name in STATE_WORDS or name.startswith(FOREIGN_PREFIXES):
                continue
            out.append(f"{tsx.relative_to(ROOT)} uses .{name}")
    return out


def main() -> int:
    found = offenders()
    if "--update-baseline" in sys.argv:
        BASELINE.write_text(
            "# Classes used in JSX that no stylesheet defines — accepted debt, not permission.\n"
            "# Each one styles nothing: either dead markup, or a real gap. This file only shrinks.\n"
            + "".join(f"{line}\n" for line in sorted(found))
        )
        print(f"wrote {BASELINE.name}: {len(found)} undefined classes")
        return 0

    baseline = set()
    if BASELINE.is_file():
        baseline = {
            line.strip()
            for line in BASELINE.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }
    fresh = [line for line in found if line not in baseline]
    if "--list" in sys.argv:
        for line in found:
            print(("ACCEPTED " if line in baseline else "NEW      ") + line)
    if fresh:
        for line in fresh:
            print(line)
        print(
            f"check-shared-styles: {len(fresh)} class(es) above are used in JSX and defined in no "
            "stylesheet — a rename is a two-file edit, and so is deleting a style block",
            file=sys.stderr,
        )
        return 1
    print(f"check-shared-styles: undefined classes OK ({len(baseline)} accepted)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
