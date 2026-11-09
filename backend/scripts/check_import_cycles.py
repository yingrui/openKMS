#!/usr/bin/env python3
"""Fail on a new import cycle between packages — a ratchet, because existing ones are known.

An architecture page that says "api → services → models" is prose; this is the same claim, measured. It found three
cycles the first time it ran, one of them created the same day by moving a function into a package that had to import
upward to name a dataset.

The unit is a **package** (`app/api`, `app/services/acl`, `app/jobs`), because cycles inside one package are usually a
helper and its caller, not a design problem. The baseline lists what exists today; a cycle that is not listed fails, and
a baseline entry that no longer exists also fails — a ratchet only turns one way.

    uv run python scripts/check_import_cycles.py            # check
    uv run python scripts/check_import_cycles.py --update    # rewrite the baseline (shrink it, never grow it)
"""
from __future__ import annotations

import ast
import collections
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APP = ROOT / "app"
BASELINE = ROOT / "scripts" / "import-cycles-baseline.txt"


def package_of(path: Path) -> str:
    parts = path.relative_to(ROOT).parts
    return "/".join(parts[:3]) if len(parts) > 3 else "/".join(parts[:2])


def edges() -> collections.Counter[tuple[str, str]]:
    found: collections.Counter[tuple[str, str]] = collections.Counter()
    for path in sorted(APP.rglob("*.py")):
        src = package_of(path)
        try:
            tree = ast.parse(path.read_text())
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            modules: list[str] = []
            if isinstance(node, ast.ImportFrom) and node.module and node.module.startswith("app."):
                modules.append(node.module)
            elif isinstance(node, ast.Import):
                modules += [alias.name for alias in node.names if alias.name.startswith("app.")]
            for module in modules:
                parts = module.split(".")
                dst = "/".join(parts[:3]) if len(parts) > 3 else "/".join(parts[:2])
                if dst != src:
                    found[(src, dst)] += 1
    return found


def cycles(found: collections.Counter[tuple[str, str]]) -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    for a, b in found:
        if (b, a) in found and (b, a) not in seen:
            seen.add((a, b))
            out.append((a, b) if a < b else (b, a))
    return sorted(out)


def main() -> int:
    found = cycles(edges())
    if "--update" in sys.argv:
        BASELINE.write_text("".join(f"{a} <-> {b}\n" for a, b in found))
        print(f"check-import-cycles: baseline rewritten with {len(found)} cycle(s)")
        return 0

    known = {
        tuple(line.strip().split(" <-> "))
        for line in BASELINE.read_text().splitlines()
        if line.strip() and not line.startswith("#")
    } if BASELINE.exists() else set()
    new = [c for c in found if c not in known]
    gone = sorted(known - set(found))

    if new:
        for a, b in new:
            print(f"  {a} <-> {b}", file=sys.stderr)
        print(
            f"check-import-cycles: {len(new)} new cycle(s) above. Move the shared piece below both packages "
            "(a helper both can import), or import one of them lazily if it is genuinely call-time only.",
            file=sys.stderr,
        )
    if gone:
        for a, b in gone:
            print(f"  gone: {a} <-> {b}  (remove it from {BASELINE.relative_to(ROOT)})", file=sys.stderr)
    if new or gone:
        return 1
    print(f"check-import-cycles: OK ({len(known)} known cycle(s))")
    return 0


if __name__ == "__main__":
    sys.exit(main())
