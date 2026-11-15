#!/usr/bin/env python3
"""Guardrail: a retired Chinese term must not come back.

Terminology is not cosmetic. 演练场 / 查询台 named the same page two different ways, 质量问题 turned out to be
a dataset-checks list sitting next to 指标勾稽, and a column called 规则 means one thing under 数据质量 and
another under 指标勾稽. Nobody notices these by reading a diff; the reader notices them and loses trust in the
screen.

So the words this product has settled on are written down in one place, and a retired word fails the build.
Adding a word here is a one-line change and a deliberate decision — which is the point.

Usage: check-terminology.py [--list]
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
ZH = SRC / "i18n" / "locales" / "zh-CN"

#: retired wording → the wording that replaced it. Keep both sides short: this is a glossary, not prose.
RETIRED = {
    "演练场": "即席查询",
    "查询台": "即席查询",
    "操场": "即席查询",
    "质量问题": "数据质量",
}


def offenders() -> list[str]:
    out: list[str] = []
    files = [*ZH.rglob("*.json"), *SRC.rglob("*.tsx"), *SRC.rglob("*.ts")]
    for path in files:
        if ".test." in path.name or ".spec." in path.name:
            continue
        text = path.read_text(errors="ignore")
        for word, replacement in RETIRED.items():
            if word in text:
                out.append(f"{path.relative_to(ROOT)} uses '{word}' — say '{replacement}'")
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
            f"check-terminology: {len(found)} retired term(s) above — the product has one word per thing",
            file=sys.stderr,
        )
        return 1
    print("check-terminology: OK (0 retired terms)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
