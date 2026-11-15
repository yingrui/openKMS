#!/usr/bin/env python3
"""Guardrail: a condition sentence must be given both name lookups.

A rule's condition text turns operands into words. `conditionLabel(condition, lookups)` needs
`metricName` **and** `datasetName`: a page that passes only the first prints `b77c2c08…: count(*) != 1620`
for a dataset operand — an id where a name belongs. That is what happened on the rules list, and no
type-checker notices a missing optional field of a structural lookup object.

The check reads the call's argument text and requires both names to appear in it.

Usage: check-label-lookups.py [--list]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
CALLS = ("conditionLabel(", "conditionScopeNote(")
REQUIRED = ("metricName", "datasetName")


def _call_text(text: str, start: int) -> str:
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    return text[start:]


def offenders() -> list[str]:
    out: list[str] = []
    for path in [*SRC.rglob("*.tsx"), *SRC.rglob("*.ts")]:
        if ".test." in path.name or ".spec." in path.name:
            continue
        text = path.read_text(errors="ignore")
        for name in CALLS:
            for match in re.finditer(re.escape(name), text):
                prefix = text[max(0, match.start() - 12) : match.start()]
                if prefix.rstrip().endswith("function"):
                    continue  # the definition, not a call
                call = _call_text(text, match.end() - 1)
                if "lookups" in call:
                    continue  # a lookup object passed through — its fields were checked at the call site
                missing = [key for key in REQUIRED if key not in call]
                if missing:
                    out.append(
                        f"{path.relative_to(ROOT)}: {name}… 缺少 {', '.join(missing)} "
                        "(a missing lookup prints an id instead of a name)"
                    )
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
            f"check-label-lookups: {len(found)} call(s) above — every operands-to-words call needs "
            "metricName and datasetName",
            file=sys.stderr,
        )
        return 1
    print("check-label-lookups: OK (0 calls missing a lookup)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
