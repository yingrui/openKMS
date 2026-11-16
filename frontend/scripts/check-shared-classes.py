#!/usr/bin/env python3
"""A class that more than one area uses is a design-system object, not a page's private style.

The rule this encodes: **the address says who owns it.** A capability used across `pages/catalog`,
`pages/console` and `components/agents` cannot be called `console-*` or `ontology-admin-*` — those
names record which page needed it first, and the next page copies the markup instead of the design
system. Page-local classes are fine; they are used in one place.

What is reported is only the *shape*: a non-`ds-*` class used by two or more areas. The baseline holds
the debt that exists today; it may shrink, never grow.
"""
from __future__ import annotations

import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "shared-classes-baseline.txt"

CLASSNAME = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\})')
TOKEN = re.compile(r"^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:__[a-z0-9-]+)?$")

#: Names that are design-system already, or global utilities / vendor hooks.
EXEMPT = {"btn", "animate-spin", "spin", "sr-only"}
EXEMPT_PREFIXES = ("ds-", "btn-", "page-", "account-", "app-", "is-", "has-",
                   "a2ui-", "force-graph", "mermaid", "katex", "cm-", "recharts-", "rc-")


def area_of(path: Path) -> str:
    parts = path.relative_to(SRC).parts
    return "/".join(parts[:2]) if len(parts) > 2 else parts[0]


def offenders() -> dict[str, set[str]]:
    usage: dict[str, set[str]] = collections.defaultdict(set)
    for tsx in SRC.rglob("*.tsx"):
        if ".test." in tsx.name:
            continue
        text = tsx.read_text(errors="ignore")
        for match in CLASSNAME.finditer(text):
            for token in (match.group(1) or match.group(2) or "").split():
                if TOKEN.match(token) and token not in EXEMPT and not token.startswith(EXEMPT_PREFIXES):
                    usage[token].add(area_of(tsx))
    return {token: areas for token, areas in usage.items() if len(areas) > 1}


def main() -> int:
    found = offenders()
    known = set()
    if BASELINE.is_file():
        known = {
            line.split()[0]
            for line in BASELINE.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }
    new = sorted(set(found) - known)
    gone = sorted(known - set(found))
    for token in new:
        print(
            f".{token} is used by {', '.join(sorted(found[token]))} — a class shared by several areas "
            "belongs to the design system (`ds-*`), or stays page-local",
            file=sys.stderr,
        )
    for token in gone:
        print(f".{token} is no longer shared — remove it from {BASELINE.name}", file=sys.stderr)
    if new or gone:
        print(
            f"check-shared-classes: {len(new)} new, {len(gone)} stale — see docs/design-system.md",
            file=sys.stderr,
        )
        return 1
    print(f"check-shared-classes: OK ({len(known)} known shared names)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
