#!/usr/bin/env python3
"""Two layout bugs that compile, lint and typecheck cleanly, and are only visible in a screenshot.

**A. Tab strip disconnected from its panel inside `EntityViewShell`.**
`EntityViewShell` renders children into `.account-stack` (``display: flex; gap: var(--space-5)``). A
page that renders `.settings-page-tabs` and `.settings-page-form` as *siblings* therefore gets a
25px hole between the strip's bottom edge and the panel's top edge: the two halves of one card are
pushed apart by an ancestor's gap, and no rule in the page can cancel a flex `gap`. Wrapping both in
`.settings-page` makes them one stack child, so the card closes. Only pages using `EntityViewHeader`
are inside that shell — a page in `.ontology-admin-content` (ConnectorDetail) is fine as siblings,
so the check keys off the shell, not off the class alone.

**B. A local margin on a `.page-subtitle` that quietly loses.**
`.page-subtitle` is global (`app-page.scss`) and declares ``margin: 0``. A colocated rule such as
``.foo { margin-bottom: var(--space-4) }`` has *equal* specificity, so whether it applies depends on
which sheet Vite happens to load last — the hint then sits flush against the toolbar below it. Scoping
the rule under a parent (``.settings-page-form .foo``) wins regardless of order. A rule that sets the
``margin`` shorthand overrides deliberately and is allowed.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"

CLASSNAME = re.compile(r'className=(?:"([^"]*)"|\{`([^`]*)`\}|\{"([^"]*)"\})')
BARE_RULE = re.compile(r"(?m)^\.([a-z0-9_-]+)\s*\{")
MARGIN_DECL = re.compile(r"(?m)^\s*margin(?:-(?:top|right|bottom|left))?\s*:([^;]+);")

#: Class tokens that only make sense as one card; the form must not be a separate stack child.
SETTINGS_CHROME = ("settings-page-tabs", "settings-page-form")

#: A margin value that is entirely zero/auto is equivalent to the global `.page-subtitle { margin: 0 }`.
ZERO_MARGIN = re.compile(r"^(?:0(?:px|rem|em)?|auto)(?:\s+(?:0(?:px|rem|em)?|auto))*$")


def class_name_tokens(text: str) -> list[list[str]]:
    """Every className literal in a file, as a list of class tokens."""
    out: list[list[str]] = []
    for match in CLASSNAME.finditer(text):
        raw = next(group for group in match.groups() if group is not None)
        # Template holes (`settings-page-tab${x}`) are not literal tokens; drop the splices.
        raw = re.sub(r"\$\{[^}]*\}", " ", raw)
        out.append([tok for tok in raw.split() if tok])
    return out


def scss_margin_declarations() -> dict[str, str]:
    """Bare top-level class -> the first non-zero margin value it declares.

    A class declaring only zero/auto margins is equivalent to the global ``.page-subtitle { margin: 0 }``
    and is not a conflict, so it is left out of the map.
    """
    found: dict[str, str] = {}
    for path in sorted(SRC.rglob("*.scss")):
        text = path.read_text(errors="ignore")
        for match in BARE_RULE.finditer(text):
            name = match.group(1)
            start = match.end() - 1
            depth = 0
            end = len(text)
            for index in range(start, len(text)):
                char = text[index]
                if char == "{":
                    depth += 1
                elif char == "}":
                    depth -= 1
                    if depth == 0:
                        end = index
                        break
            body = text[start:end]
            for decl in MARGIN_DECL.finditer(body):
                value = decl.group(1).strip()
                if not ZERO_MARGIN.match(value):
                    found.setdefault(name, value)
                    break
    return found


def offenders() -> list[str]:
    margins = scss_margin_declarations()
    out: list[str] = []

    for path in sorted(SRC.rglob("*.tsx")):
        if ".test." in path.name:
            continue
        text = path.read_text(errors="ignore")
        rel = path.relative_to(ROOT)
        literals = class_name_tokens(text)

        # A. settings chrome rendered as siblings inside the entity-view stack.
        uses_chrome = any(
            token in SETTINGS_CHROME for tokens in literals for token in tokens
        )
        if uses_chrome and "EntityViewHeader" in text:
            wrapped = any("settings-page" in tokens for tokens in literals)
            if not wrapped:
                line = text[: text.find("settings-page-tabs")].count("\n") + 1
                out.append(
                    f"{rel}:{line}: settings-page chrome rendered directly inside EntityViewShell "
                    "(.account-stack gap splits the tab strip from its panel) — wrap the strip and "
                    "the panel in one `<div className=\"settings-page\">`"
                )

        # B. A local margin that competes with the global `.page-subtitle { margin: 0 }`.
        for tokens in literals:
            if "page-subtitle" not in tokens:
                continue
            for token in tokens:
                if token == "page-subtitle" or token not in margins:
                    continue
                out.append(
                    f"{rel}: `.page-subtitle` combined with `.{token}` (margin: {margins[token]}) "
                    "ties with the global `margin: 0` — scope the rule under a parent so load order "
                    "cannot decide it"
                )
    return out


def main() -> int:
    found = offenders()
    if found:
        for line in found:
            print(line)
        print(
            f"check-shared-styles: {len(found)} layout regression(s) above — see docs/design-system.md "
            "(tab rows and the page-subtitle margin)",
            file=sys.stderr,
        )
        return 1
    print("check-shared-styles: page chrome OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
