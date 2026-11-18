#!/usr/bin/env python3
"""The pane layout and the entity shell must agree on which routes are entity pages.

`EntityViewShell` only fills the window (and only reaches the bottom of the screen with its
sidebar rule) when a `.app-page-pane` supplies the height chain and the gutter. That contract is
invisible in a unit test and the failure is cosmetic — the sidebar's border stops halfway down —
so it is checked here instead: a page that imports `EntityViewShell` and is routed outside the
pane layout fails, instead of quietly looking wrong on a short page.

The **converse** is checked for the same reason, one bug later: the pane brings a 24px gutter and its
own scroll container, so a full-bleed route that does not render the shell ends up inset and scrolling
inside a second box. That is what the workforce conversation did when it was routed in here — nothing
failed, it just looked wrong. A top-level route inside `PagePaneLayout` must therefore render the
shell; a nested one (`element={<DatasetOverviewTab />}` under `datasets/:id`) need not, because the
shell it belongs to is already there.

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


#: The *component*, not the module path: `import { EntityViewPanel } from '../shared/EntityViewShell'`
#: must not count — only pages that render the shell need the pane.
SHELL_USAGE = re.compile(r"(?<![\w/.])EntityViewShell\b(?!\.)")

#: Anything imported from the shell's module. A page that renders its panels (`RuleNewPage` does) is part
#: of the same family and belongs in the pane just as much as one that renders the shell itself.
SHELL_MODULE_IMPORT = re.compile(r"from\s+'[^']*shared/EntityViewShell'")


def imports_shell_module(spec: str) -> bool:
    base = (ROOT / "src" / spec.removeprefix("./")).resolve()
    for candidate in (base, base.with_suffix(".tsx"), base.with_suffix(".ts")):
        if candidate.is_file():
            return bool(SHELL_MODULE_IMPORT.search(candidate.read_text()))
    return False


def uses_entity_shell(spec: str) -> bool:
    base = (ROOT / "src" / spec.removeprefix("./")).resolve()
    for candidate in (base, base.with_suffix(".tsx"), base.with_suffix(".ts")):
        if candidate.is_file():
            return bool(SHELL_USAGE.search(candidate.read_text()))
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


PAGE_PANE_MARKER = "<Route element={<PagePaneLayout />}>"


def pane_ranges(app: str) -> list[tuple[int, int]]:
    markers = [PAGE_PANE_MARKER]
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

    family = {
        name
        for name, spec in modules.items()
        if name in shell_names or imports_shell_module(spec)
    }
    problems += strays_in_pane(app, family)
    if problems:
        for problem in problems:
            print(f"check-entity-view-routes: {problem}", file=sys.stderr)
        print(
            "check-entity-view-routes: a route inside <Route element={<PagePaneLayout />}> must render "
            "EntityViewShell — the pane adds a page gutter and a scroll container, which a full-bleed "
            "page does not want. Move it out of the block (and give it its own height chain).",
            file=sys.stderr,
        )
        return 1

    print(f"check-entity-view-routes: OK ({len(shell_names)} shell pages in the pane layout)")
    return 0


def strays_in_pane(app: str, shell_names: set[str]) -> list[str]:
    """Top-level routes inside the pane that do not render the entity shell."""
    out: list[str] = []
    # Only the layout this gate is about: the ontology suite's roots get their pane from a rail layout,
    # and a full-bleed editor lives in one of them on purpose.
    for start, end in [route_block_range(app, PAGE_PANE_MARKER)]:
        block = app[start:end]
        line_start = app.rfind("\n", 0, start) + 1
        inner = app[line_start:start] + "  "
        pattern = re.compile(
            "^" + re.escape(inner) + r"<Route\b[^\n]*element=\{<([A-Za-z_]\w*)", re.M
        )
        for match in pattern.finditer(block):
            name = match.group(1)
            if name in shell_names:
                continue
            line = app[: start + match.start()].count("\n") + 1
            out.append(f"{name} (App.tsx:{line}) is routed inside PagePaneLayout but does not render the shell")
    return out


if __name__ == "__main__":
    raise SystemExit(main())
