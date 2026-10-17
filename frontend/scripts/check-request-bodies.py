#!/usr/bin/env python3
"""Fail when a request sends a JSON body without saying so.

`fetch` does **not** default to JSON: without `Content-Type: application/json` the body arrives as
`text/plain`, FastAPI hands the raw string to Pydantic, and the reader gets

    Input should be a valid dictionary or object to extract fields from

which says nothing about the cause. It cost two functions once (`updateQualityRule`,
`validateQualityRule`), so it is a check rather than a comment.

Scope: a call that passes `body: JSON.stringify(...)` and **no `headers:` at all** is flagged — that is
the shape the bug had. A call that sets headers (inline or through a shared constant like `JSON_HEADERS`)
is someone else's decision and is left alone, so the check has no false positives; it cannot see a
headers object that is missing the type, and does not pretend to.

Only `JSON.stringify` counts: a `FormData` body must *not* be JSON, and flagging it would be wrong.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

CALLS = re.compile(r"\b(?:request|requestRaw|requestText|fetchWithAuth|fetch)\s*(?:<[^>]*>)?\(")
JSON_BODY = re.compile(r"\bbody\s*:\s*JSON\.stringify\(")
HEADERS_KEY = re.compile(r"\bheaders\s*:")


def call_text_at(text: str, start: int) -> str:
    """The text of a call from `(` to its matching `)`, string-literal aware enough for this job."""
    depth = 0
    quote: str | None = None
    i = start
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == "\\":
                i += 2
                continue
            if ch == quote:
                quote = None
        elif ch in "'\"`":
            quote = ch
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
        i += 1
    return text[start:]


def main() -> int:
    offenders: list[str] = []
    for path in sorted(SRC.rglob("*")):
        if path.suffix not in (".ts", ".tsx") or ".test." in path.name:
            continue
        text = path.read_text(errors="ignore")
        for match in CALLS.finditer(text):
            call = call_text_at(text, match.end() - 1)
            if not JSON_BODY.search(call) or HEADERS_KEY.search(call):
                continue
            line = text.count("\n", 0, match.start()) + 1
            offenders.append(f"{path.relative_to(ROOT)}:{line}: JSON body with no headers at all")

    if offenders:
        for line in offenders:
            print(line)
        print(
            f"check-shared-styles: {len(offenders)} request(s) above send a JSON body with no "
            "`'Content-Type': 'application/json'` — the server reads a string, not an object",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: request bodies OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
