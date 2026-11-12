#!/usr/bin/env python3
"""Guardrail: a stylesheet rule that styles nothing.

CSS only rots in one direction: a component changes, its rules stay, and nothing fails — the sheet
keeps a dead half and the next reader cannot tell which half is real. `EvaluationDatasetDetail.scss`
was 897 lines with 41 top-level rules for classes no page renders. Counting them once is how this
gate exists; the count was 272 blocks across 128 sheets.

A class counts as used when it appears anywhere in `src/**/*.ts(x)` — as a whole token, as the base
of a `--modifier` / `__element` (`.story-finding` is used by `story-finding__meta`), or as the fixed
prefix of a template literal (`` `eval-report-finding--${area}` ``). Rules with `&` are skipped: their
selector is only known in context.

Usage: check-dead-classes.py [--list|--update-baseline]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "dead-classes-baseline.txt"

# Classes rendered by a library, not by our JSX: CodeMirror builds `.cm-editor` / `.cm-gutters` at
# runtime, the A2UI renderer its own. They are ours to style and never appear in our sources.
VENDOR_PREFIXES = ("cm-", "a2ui", "monaco")


def source_text() -> tuple[str, list[str]]:
    code = "\n".join(
        path.read_text() for path in [*SRC.rglob("*.tsx"), *SRC.rglob("*.ts")]
    )
    # A template may contain several classes before ${...}; keep each token, not the
    # whole "class-a class-b--" prefix (which never matches a startswith check).
    templates = [
        part
        for t in re.findall(r"`[^`]*\$\{[^`]*`", code)
        for part in t.split("${")[0].split()
        if part
    ]
    return code, templates


def is_used(cls: str, code: str, templates: list[str]) -> bool:
    if cls.startswith(VENDOR_PREFIXES):
        return True
    if re.search(r"(?<![A-Za-z0-9_])" + re.escape(cls) + r"(?![A-Za-z0-9_-])", code):
        return True
    if re.search(r"(?<![A-Za-z0-9_-])" + re.escape(cls) + r"[-_]", code):
        return True
    return any(prefix and cls.startswith(prefix) for prefix in templates)


def dead_selectors(path: Path, code: str, templates: list[str]) -> list[str]:
    lines = path.read_text().split("\n")
    found: list[str] = []
    for index, line in enumerate(lines):
        stripped = line.strip()
        previous = next((l for l in reversed(lines[:index]) if l.strip()), "")
        if not stripped.startswith(".") or not stripped.endswith("{"):
            continue
        # A selector list spans lines: `.a,\n.b {` — the owning block is the first line.
        if previous.rstrip().endswith(","):
            continue
        classes = re.findall(r"\.([A-Za-z0-9_-]+)", stripped)
        if not classes or "&" in stripped:
            continue
        if any(is_used(cls, code, templates) for cls in classes):
            continue
        found.append(stripped[:70])
    return found


def main(argv: list[str]) -> int:
    code, templates = source_text()
    hits: list[tuple[str, str]] = []
    for sheet in sorted(SRC.rglob("*.scss")):
        for selector in dead_selectors(sheet, code, templates):
            hits.append((str(sheet.relative_to(ROOT)), selector))

    if "--list" in argv:
        for where, selector in hits:
            print(f"{where}: {selector}")
        return 0

    if "--update-baseline" in argv:
        BASELINE.write_text(
            "# Rules that style nothing — known debt, ratchets down only.\n"
            + "".join(f"{where} {selector}\n" for where, selector in hits)
        )
        print(f"check-dead-classes: baseline updated ({len(hits)} rules)")
        return 0

    allowed = 0
    if BASELINE.is_file():
        allowed = sum(
            1 for line in BASELINE.read_text().splitlines() if line.strip() and not line.startswith("#")
        )

    if len(hits) > allowed:
        for where, selector in hits[:40]:
            print(f"check-dead-classes: {where} {selector} styles nothing — delete it", file=sys.stderr)
        print(f"check-dead-classes: {len(hits)} dead rules, baseline {allowed}", file=sys.stderr)
        return 1

    print(f"check-dead-classes: OK ({len(hits)} dead, baseline {allowed})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
