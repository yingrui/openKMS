#!/usr/bin/env python3
"""Guardrail: a form control must carry the design-system skin.

`.ds-field select` / `.ds-field input` only style controls **inside** a `<FormField>`;
every other `select` / text `input` must carry `.ds-control`, or it renders as the raw
browser widget (that is exactly how the Playground's filters shipped unstyled).

The pre-existing debt is frozen in `scripts/ds-controls-baseline.txt` (one
`path count` per line). The check **ratchets**: a file that gains an unskinned control
fails, a file that drops one is fine. Regenerate with `--update-baseline`;
`--list` prints every hit.

Usage: check-ds-controls.py [--list|--update-baseline]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

BASELINE = Path(__file__).resolve().parent / "ds-controls-baseline.txt"

# `input` types that are text-like; checkbox/radio/file/range keep their own skin.
TEXT_INPUT_TYPES = {
    "text",
    "search",
    "number",
    "url",
    "password",
    "email",
    "tel",
    "date",
    "datetime-local",
    "time",
    "month",
}

VOID_TAGS = {"input", "br", "img", "hr", "meta", "link", "source", "area", "base", "col"}
TAG = re.compile(r"<(/?)([A-Za-z][\w.$]*)")
TYPE = re.compile(r"""type\s*=\s*(?:"([^"]*)"|'([^']*)'|\{['"]([^'"]*)['"]\})""")


def tag_end(src: str, start: int) -> int:
    """Index of the `>` closing the tag that starts at `start`, quote/brace aware."""
    i, brace, quote = start, 0, None
    while i < len(src):
        ch = src[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in "\"'`":
            quote = ch
        elif ch == "{":
            brace += 1
        elif ch == "}":
            brace -= 1
        elif ch == ">" and brace == 0:
            return i
        i += 1
    return len(src) - 1


def input_type(tag: str) -> str:
    m = TYPE.search(tag)
    return (m.group(1) or m.group(2) or m.group(3) or "text") if m else "text"


EXEMPT = "ds-control-exempt"


def _exempt(src: str, start: int) -> bool:
    """A control may opt out with a `ds-control-exempt` comment (a wrapper styles it)."""
    return EXEMPT in src[max(0, start - 400) : start].rsplit("\n\n", 1)[-1]


def hits_in(path: Path) -> list[tuple[int, str]]:
    src = path.read_text()
    out: list[tuple[int, str]] = []
    stack: list[str] = []
    i = 0
    while True:
        m = TAG.search(src, i)
        if not m:
            break
        closing, name = m.group(1) == "/", m.group(2)
        end = tag_end(src, m.start())
        tag = src[m.start() : end + 1]
        if closing:
            for j in range(len(stack) - 1, -1, -1):
                if stack[j] == name:
                    del stack[j:]
                    break
            i = end + 1
            continue

        in_form_field = "FormField" in stack
        skinned = "ds-control" in tag
        wants_skin = name == "select" or (name == "input" and input_type(tag) in TEXT_INPUT_TYPES)
        if wants_skin and not skinned and not in_form_field and not _exempt(src, m.start()):
            out.append((src.count("\n", 0, m.start()) + 1, re.sub(r"\s+", " ", tag)[:72]))

        self_closing = tag.rstrip().endswith("/>")
        if not (self_closing or name in VOID_TAGS):
            stack.append(name)
        i = end + 1
    return out


def read_baseline() -> dict[str, int]:
    if not BASELINE.exists():
        return {}
    out: dict[str, int] = {}
    for line in BASELINE.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        path, _, count = line.rpartition(" ")
        out[path] = int(count)
    return out


def collect() -> dict[str, list[tuple[int, str]]]:
    found: dict[str, list[tuple[int, str]]] = {}
    for path in sorted(SRC.rglob("*.tsx")):
        hits = hits_in(path)
        if hits:
            found[str(path.relative_to(ROOT))] = hits
    return found


def main() -> int:
    found = collect()

    if "--list" in sys.argv:
        for rel, hits in found.items():
            for line, tag in hits:
                print(f"{rel}:{line}: {tag}")
        return 0

    if "--update-baseline" in sys.argv:
        BASELINE.write_text(
            "# Unskinned form controls, frozen so the count only ratchets down.\n"
            "# Regenerate: python3 scripts/check-ds-controls.py --update-baseline\n"
            + "".join(f"{rel} {len(hits)}\n" for rel, hits in sorted(found.items()))
        )
        print(f"wrote {BASELINE.name}: {sum(len(h) for h in found.values())} hits in {len(found)} files")
        return 0

    baseline = read_baseline()
    problems = 0
    for rel, hits in found.items():
        allowed = baseline[rel] if rel in baseline else 0
        if len(hits) <= allowed:
            continue
        for line, tag in hits[allowed:]:
            problems += 1
            print(f"{rel}:{line}: {tag}")
    if problems:
        print(
            f"check-shared-styles: {problems} form control(s) above would render unstyled — "
            'use <FormField> or className="ds-control" (baseline: scripts/ds-controls-baseline.txt)',
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
