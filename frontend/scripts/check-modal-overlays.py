#!/usr/bin/env python3
"""Guardrail: modals are `<Dialog>`, not hand-rolled overlay markup.

The previous gate grepped for one class name, `console-modal-overlay`. That name was the one being
migrated at the time, so renaming the markup — `glossary-dialog-overlay`, `sreview-modal-overlay`,
`eval-dialog-overlay` — made it invisible, and the migration was reported as finished while fifteen
copies were still there. This counts the *shape* instead: an element whose class ends in `-overlay`
and that is not the design system's own.

Counted per occurrence, frozen in `scripts/modal-overlays-baseline.txt`. The baseline only shrinks:
lower it as each modal moves to `<Dialog>`.

Usage: check-modal-overlays.py [--list|--update-baseline]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "modal-overlays-baseline.txt"

CLASS_ATTR = re.compile(r"""className=(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{['"]([^'"]*)['"]\})""")

# Not modal chrome: the DS dialog itself, and overlays that sit on top of an editor or dropzone.
# `...-file-input-overlay` is a file input stretched over a label's button (the native picker behind
# a styled button) — an input, not modal chrome. The DS dialog itself, and editor dropzones, likewise.
EXEMPT_SUFFIXES = ("ds-dialog-overlay", "dropzone-overlay", "file-input-overlay")


def main(argv: list[str]) -> int:
    hits: list[tuple[str, str]] = []
    for path in SRC.rglob("*.tsx"):
        source = path.read_text()
        for match in CLASS_ATTR.finditer(source):
            value = next(group for group in match.groups() if group is not None)
            for name in value.split():
                if not name.endswith("-overlay") or name.endswith(EXEMPT_SUFFIXES):
                    continue
                line = source[: match.start()].count("\n") + 1
                hits.append((str(path.relative_to(ROOT)), f"{path.relative_to(ROOT)}:{line} .{name}"))

    if "--list" in argv:
        for _, where in hits:
            print(where)
        return 0

    if "--update-baseline" in argv:
        BASELINE.write_text(
            "# Hand-rolled modal overlays — known debt, ratchets down only.\n"
            + "".join(f"{file} .{where.rsplit('.', 1)[1]}\n" for file, where in hits)
        )
        print(f"check-modal-overlays: baseline updated ({len(hits)} overlays)")
        return 0

    baseline = 0
    if BASELINE.is_file():
        baseline = sum(
            1
            for line in BASELINE.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        )

    if len(hits) > baseline:
        for _, where in sorted(set(hits)):
            print(f"check-modal-overlays: {where} is hand-rolled modal chrome — use <Dialog>", file=sys.stderr)
        print(
            f"check-modal-overlays: {len(hits)} overlays, baseline {baseline}; the count may only shrink",
            file=sys.stderr,
        )
        return 1

    print(f"check-modal-overlays: OK ({len(hits)} hand-rolled, baseline {baseline})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
