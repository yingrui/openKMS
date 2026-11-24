#!/usr/bin/env python3
"""Guardrail: a control placed in a page header does not choose its own button size.

The header's `actions` row is one visual unit — its buttons share a height. A shared control that pins `btn-sm`
inside itself renders 28px tall next to 40px neighbours, and the page cannot fix it from the outside: the caller
only writes `<ExplorerMenu />`. That is how the explorer's menu shipped a head shorter than 布局 and 保存探索.

So the rule is about the *placement*, not the size: a component that appears inside an `actions={...}` slot must
not carry a size modifier of its own. Size is the header's decision.

Legitimate `btn-sm` elsewhere (toolbars, inline row actions) is untouched.

Usage: check-header-action-size.py [--list]
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


def actions_blocks(text: str) -> list[str]:
    """The JSX inside every `actions={...}`, by brace matching."""
    blocks: list[str] = []
    for match in re.finditer(r"actions=\{", text):
        start = match.end() - 1
        depth = 0
        for index in range(start, len(text)):
            if text[index] == "{":
                depth += 1
            elif text[index] == "}":
                depth -= 1
                if depth == 0:
                    blocks.append(text[start + 1 : index])
                    break
    return blocks


def components_in_actions() -> dict[str, set[str]]:
    users: dict[str, set[str]] = {}
    for path in SRC.rglob("*.tsx"):
        for block in actions_blocks(path.read_text()):
            for match in re.finditer(r"<([A-Z]\w+)", block):
                users.setdefault(match.group(1), set()).add(str(path.relative_to(ROOT)))
    return users


def main() -> int:
    hit_list = "--list" in sys.argv
    users = components_in_actions()
    offenders: list[str] = []
    for name in sorted(users):
        for path in SRC.rglob("*.tsx"):
            if path.stem != name:
                continue
            text = path.read_text()
            if not re.search(r"\bbtn-(sm|lg|xs)\b", text):
                continue
            line = 1 + text[: text.find("btn-")].count("\n")
            offenders.append(
                f"{path.relative_to(ROOT)}:{line} {name} pins a button size, but it is placed in a header actions row "
                f"({', '.join(sorted(users[name])[:2])}); let the header size it"
            )
    if offenders:
        for line in offenders:
            print(line, file=sys.stderr)
        print(
            f"check-header-action-size: {len(offenders)} control(s) size themselves inside a header",
            file=sys.stderr,
        )
        return 1
    if hit_list:
        print(f"check-header-action-size: {len(users)} header controls, none pin a size")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
