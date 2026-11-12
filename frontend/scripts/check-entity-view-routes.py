#!/usr/bin/env python3
"""Every route that renders the entity shell must sit inside `PagePaneLayout`.

`EntityViewShell` only fills the window (and only reaches the bottom of the screen with its
sidebar rule) when a `.app-page-pane` supplies the height chain and the gutter. That contract is
invisible in a unit test and the failure is cosmetic — the sidebar's border stops halfway down —
so it is checked here instead: a page that imports `EntityViewShell` and is routed outside the
pane layout fails, instead of quietly looking wrong on a short page.

Run from `frontend/` (wired into `npm run check:app-layout`).
"""

from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "src/App.tsx"


def resolve_modules(app: str) -> dict[str, str]:
    """Component name → source file, from the lazy() factory bodies and the static imports."""
    modules: dict[str, str] = {}
    for name, spec in re.findall(
        r"const\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*\n?\s*import\('([^']+)'\)", app
    ):
        modules[name] = spec
    for name, spec in re.findall(r"import\s*\{\s*(\w+)\s*\}\s*from\s*'([^']+)'", app):
        modules[name] = spec
    return modules


def uses_entity_shell(spec: str) -> bool:
    base = (ROOT / "src" / spec.removeprefix("./")).resolve()
    for candidate in (base, base.with_suffix(".tsx"), base.with_suffix(".ts")):
        if candidate.is_file():
            return "EntityViewShell" in candidate.read_text()
    return False


def route_block_range(app: str, marker: str) -> tuple[int, int]:
    """Character span of one route block whose opening line contains `marker`.

    The JSX tags cannot be counted reliably (`element={<X />}` puts a slash inside an attribute),
    so this relies on the file's own formatting: the block opens and closes on an equally indented
    line. A self-closing `<Route>` inside it is fine, an unbalanced block is not.
    """
    start = app.index(marker)
    line_start = app.rfind("\n", 0, start) + 1
    indent = app[line_start:start]
    close = f"\n{indent}</Route>"
    end = app.find(close, start)
    if end < 0:
        raise SystemExit(f"check-entity-view-routes: no closing </Route> for {marker}")
    return start, end


# Routes that already get a `.app-page-pane` from `MainLayout` (the ontology suite's rail
# layout owns one) — `check-app-page-gutters.sh` asserts that wrapper exists.
PANE_PROVIDED_ROOT_ROUTES = ("ontology-manager", "object-explorer", "function-editor")


def pane_ranges(app: str) -> list[tuple[int, int]]:
    markers = ['<Route element={<PagePaneLayout />}>']
    markers += [f'<Route path="{name}" element={{<Outlet />}}>' for name in PANE_PROVIDED_ROOT_ROUTES]
    return [route_block_range(app, marker) for marker in markers if marker in app]


def main() -> int:
    app = APP.read_text()
    modules = resolve_modules(app)
    shell_names = {name for name, spec in modules.items() if uses_entity_shell(spec)}
    ranges = pane_ranges(app)

    problems: list[str] = []
    for name in sorted(shell_names):
        block = re.search(r"<Route\b[^>]*?element=\{[^}]*?" + re.escape(name) + r"\b", app, re.S)
        if block is None:
            continue
        if not any(start <= block.start() <= end for start, end in ranges):
            line = app[: block.start()].count("\n") + 1
            problems.append(f"{name} (App.tsx:{line}) renders the entity shell outside PagePaneLayout")

    if problems:
        for problem in problems:
            print(f"check-entity-view-routes: {problem}", file=sys.stderr)
        print(
            "check-entity-view-routes: move the route into the <Route element={<PagePaneLayout />}> "
            "block — the shell needs the pane for its height chain and gutter.",
            file=sys.stderr,
        )
        return 1

    print(f"check-entity-view-routes: OK ({len(shell_names)} shell pages in the pane layout)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
