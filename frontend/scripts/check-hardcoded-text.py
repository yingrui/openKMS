#!/usr/bin/env python3
"""Guardrail: user-visible copy comes from the locale files.

Hardcoded English (or Chinese) in JSX is invisible until someone switches language: the page renders one language's copy
inside another language's chrome. `title` / `aria-label` / `placeholder` / `alt` are the same problem with a worse
audience — screen readers and tooltips are the only place those strings surface.

Not counted, on purpose:
  - text inside a `<Trans>` element — that is the English fallback for a key, which is how `Trans` works;
  - identifier-looking values (`placeholder="KEY"`, `placeholder="default"`, `Asia/Shanghai`) — data, not copy;
  - CSS-looking attribute values (lowercase-hyphen tokens) and anything with `{}` (already an expression).

Frozen in `scripts/hardcoded-text-baseline.txt`; the count may only shrink.

Usage: check-hardcoded-text.py [--list|--update-baseline]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "hardcoded-text-baseline.txt"

TEXT = re.compile(r">\s*([^<>{}\n]{1,80}?)\s*<")
ATTR = re.compile(r'\b(title|aria-label|placeholder|alt)="([^"{}]{1,100})"')
TRANS_SPAN = re.compile(r"<Trans\b.*?</Trans>", re.S)
CODE_TOKEN = re.compile(r"^[a-z][A-Za-z0-9_.-]*$")
TYPE_TOKENS = {
    "Promise", "Record", "Array", "Map", "Set", "Omit", "Partial", "Pick", "Readonly",
    "ReturnType", "ReactNode", "JSX", "HTMLElement",
}
CONSTANT = re.compile(r"^[A-Z][A-Z0-9_]+$")
NOT_COPY_CHARS = re.compile(r"[(){}\[\]<>?$&|;=]")
HAS_WORD = re.compile(r"[A-Za-z\u4e00-\u9fff]{2}")
# Values that are data, not copy: file names, timezone ids, sample identifiers, sample commands.
DATA_VALUES = {
    "/SKILL.md", "Asia/Shanghai", "America/New_York", "000001.SZ", "git, jq, sed",
    "http://backend:8200", "Python",
}


def looks_like_copy(text: str) -> bool:
    text = text.strip()
    if len(text) < 2 or text in {"—", "·", "|", "/"}:
        return False
    if text[0] in ",;:.=":  # 表达式 / 属性列表的残片，不是文案
        return False
    if NOT_COPY_CHARS.search(text):
        return False
    if text in TYPE_TOKENS or text in DATA_VALUES or CODE_TOKEN.match(text) or CONSTANT.match(text):
        return False
    return bool(HAS_WORD.search(text))


def scan(path: Path) -> list[tuple[int, str]]:
    source = path.read_text()
    body = source
    # `<Trans>` children are the fallback copy for a key — they are supposed to be English.
    masked = list(body)
    for span in TRANS_SPAN.finditer(body):
        for index in range(span.start(), span.end()):
            masked[index] = " "
    body = "".join(masked)

    hits: list[tuple[int, str]] = []
    for match in TEXT.finditer(body):
        text = source[match.start(1) : match.end(1)].strip()
        if looks_like_copy(text):
            hits.append((body[: match.start()].count("\n") + 1, text))
    for match in ATTR.finditer(body):
        value = body[match.start(2) : match.end(2)].strip()
        if looks_like_copy(value):
            hits.append((body[: match.start()].count("\n") + 1, f'{match.group(1)}="{value}"'))
    return hits


def main(argv: list[str]) -> int:
    rows: list[tuple[str, int, str]] = []
    for path in sorted(SRC.rglob("*.tsx")):
        if ".test." in path.name:
            continue
        for line, text in scan(path):
            rows.append((str(path.relative_to(ROOT)), line, text))

    if "--list" in argv:
        for where, line, text in rows:
            print(f"{where}:{line}  {text}")
        return 0

    if "--update-baseline" in argv:
        BASELINE.write_text(
            "# Hardcoded user-visible copy — known debt, ratchets down only.\n"
            + "".join(f"{where}:{line}  {text}\n" for where, line, text in rows)
        )
        print(f"check-hardcoded-text: baseline updated ({len(rows)} strings)")
        return 0

    allowed = 0
    if BASELINE.is_file():
        allowed = sum(
            1 for line in BASELINE.read_text().splitlines() if line.strip() and not line.startswith("#")
        )

    if len(rows) > allowed:
        for where, line, text in rows[:40]:
            print(f'check-hardcoded-text: {where}:{line}  "{text}" is hardcoded copy — use t()', file=sys.stderr)
        print(f"check-hardcoded-text: {len(rows)} strings, baseline {allowed}", file=sys.stderr)
        return 1

    print(f"check-hardcoded-text: OK ({len(rows)} hardcoded, baseline {allowed})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
