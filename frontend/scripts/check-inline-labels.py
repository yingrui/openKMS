#!/usr/bin/env python3
"""Guardrail: a label sitting beside its control must not break between characters.

`<label class="x"><span>类型</span><select … /></label>` laid out as a flex row is one line of text plus a
control. When the row is a flex item that can shrink (a toolbar with `justify-content: space-between`, a
pagination row), the browser shrinks the label to its minimum content width *before* it shrinks the select —
one character wide. Latin text overflows instead, so only Chinese exposes it: 类型 renders as 类 / 型, one per
line, and nothing in a unit test or a type check notices.

So the rule is: a flex-row label that contains text and a control needs `white-space: nowrap`.

Not checked, on purpose:
  - `flex-direction: column` labels — the text is above the control and cannot be squeezed sideways;
  - checkbox / radio / file labels — those are sentences, wrapping is what they should do.

The pre-existing debt is frozen in `scripts/inline-labels-baseline.txt`; the check ratchets.

Usage: check-inline-labels.py [--list|--update-baseline]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "inline-labels-baseline.txt"

LABEL = re.compile(r"<label\b([^>]*)>((?:(?!</label>).)*?)</label>", re.S)
CLASS_ATTR = re.compile(r"""className=(?:"([^"]+)"|\{'([^']+)'\})""")
CONTROL = re.compile(r"<(select|input|textarea)\b([^>]*)>", re.S)
PROSE_INPUT = re.compile(r"""type=(?:"|'|\{['"])(checkbox|radio|file)""")
RULE = re.compile(r"\.([A-Za-z0-9_-]+)\s*\{([^{}]*)\}")


def scss_rules() -> dict[str, list[tuple[Path, str]]]:
    rules: dict[str, list[tuple[Path, str]]] = {}
    for path in (*SRC.rglob("*.scss"),):
        for match in RULE.finditer(path.read_text()):
            rules.setdefault(match.group(1), []).append((path, match.group(2)))
    return rules


def is_row_label(block: str) -> bool:
    if not re.search(r"display:\s*(inline-)?flex", block):
        return False
    return not re.search(r"flex-direction:\s*column", block)


def main(argv: list[str]) -> int:
    rules = scss_rules()
    hits: list[tuple[str, str, Path]] = []

    for path in SRC.rglob("*.tsx"):
        source = path.read_text()
        for label in LABEL.finditer(source):
            attrs, body = label.group(1), label.group(2)
            if "<span" not in body:
                continue
            control = CONTROL.search(body)
            if control is None:
                continue
            if control.group(1) == "input" and PROSE_INPUT.search(control.group(2)):
                continue
            class_attr = CLASS_ATTR.search(attrs)
            if class_attr is None:
                continue
            names = (class_attr.group(1) or class_attr.group(2) or "").split()
            for name in names:
                for sheet, block in rules.get(name, []):
                    if not is_row_label(block):
                        continue
                    if "white-space" in block:
                        continue
                    hits.append((str(path.relative_to(ROOT)), name, sheet))
                    break

    keyed = {(file, name): 0 for file, name, _ in hits}

    if "--list" in argv:
        for file, name, sheet in sorted(set(hits)):
            print(f"{file}: .{name} ({sheet.relative_to(ROOT)}) is a flex row with no white-space")
        return 0

    if "--update-baseline" in argv:
        lines = ["# Flex-row labels without white-space: nowrap — known debt, ratchets down only."]
        lines += [f"{file} {name}" for file, name in sorted(keyed)]
        BASELINE.write_text("\n".join(lines) + "\n")
        print(f"check-inline-labels: baseline updated ({len(keyed)} entries)")
        return 0

    allowed: set[tuple[str, str]] = set()
    if BASELINE.is_file():
        for line in BASELINE.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) == 2:
                allowed.add((parts[0], parts[1]))

    failures = [hit for hit in sorted(keyed) if hit not in allowed]
    if failures:
        for file, name in failures:
            print(
                f"check-inline-labels: {file} .{name} is a flex row around a labelled control without "
                f"`white-space: nowrap` — Chinese labels break one character per line once the row is squeezed",
                file=sys.stderr,
            )
        return 1

    print(f"check-inline-labels: OK ({len(allowed)} frozen)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
