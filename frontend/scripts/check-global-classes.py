#!/usr/bin/env python3
"""Guardrail: a class used by two routes must not live in one route's stylesheet.

Vite ships a page's SCSS with that page's lazy chunk, so a class defined in
`pages/<area>/x.scss` and reused from another route silently loses its styles depending on
which page the visitor opened first. Three times now: the semantic-model page's Add buttons
shipped unstyled, a failure block was styled only because `ontology-admin.scss` happened to be
in the bundle, and the report view styles (KPI / ranking / strip) lived in `data-explorer.scss`
while the same components render inside "save this query" — opened from the Playground and the
Data tab.

Detection: collect the classes **page** sheets define (everything outside `src/styles/`,
`App.scss`, `index.scss`, and `components/` — a component's own colocated sheet travels with it),
then flag those used by a file that **two or more routes can render**. Route membership comes
from the import graph rooted at the lazily-imported page files in `App.tsx`, so two sections of
the *same* area count as two routes — which is exactly how the report view styles slipped past an
earlier, area-based version of this check.
`scripts/global-classes-baseline.txt` freezes today's offenders — the check ratchets:
fixing them is always fine, adding one fails. Regenerate with `--update-baseline`.

Usage: check-global-classes.py [--list|--update-baseline]
"""
from __future__ import annotations

import collections
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
BASELINE = Path(__file__).resolve().parent / "global-classes-baseline.txt"
GLOBAL_FILES = {"App.scss", "index.scss"}

CLASS_DEF = re.compile(r"\.((?:[a-z][a-z0-9]*(?:-[a-z0-9]+)*__)?[a-z][a-z0-9-]*)")


def _leads_selector(text: str, at: int) -> bool:
    """True when the match starts its selector, e.g. `.foo` in `.foo, .bar {}`.

    A class that follows another selector (`.page--fill .km-map-canvas-wrap`, or a
    compound like `.a.b`) is an *override of someone else's class*, not ownership.
    """
    boundary = max(text.rfind(ch, 0, at) for ch in "{[,\n}")
    return not text[boundary + 1 : at].strip()


def _is_definition(text: str, at: int) -> bool:
    """A selector *definition*, not a mention inside `:not(...)` / `:has(...)`.

    `.console-modal-body label:not(.ds-check-row) { … }` mentions `.ds-check-row` in a
    page stylesheet without defining it — counting that would blame the wrong file.
    """
    if not _leads_selector(text, at):
        return False
    line_start = text.rfind("\n", 0, at) + 1
    before = text[line_start:at]
    paren = before.rfind("(")
    if paren == -1:
        return True
    # inside a functional pseudo-class only if that "(" is not already closed
    return before.rfind(")") > paren


def defined_here(text: str) -> set[str]:
    return {m.group(1) for m in CLASS_DEF.finditer(text) if _is_definition(text, m.start())}



def with_amp_nesting(text: str) -> set[str]:
    """Expand `&-suffix` / `&__element` against the nearest preceding class.

    `.page-header { &-actions { … } }` defines `.page-header-actions` — invisible to a
    plain class scan, and the reason `.page-header-actions` looked page-owned.
    """
    names = set(defined_here(text))
    last = None
    for m in re.finditer(r"\.[a-z][a-z0-9-]*|&(__|-)([a-z0-9-]+)", text):
        token = m.group(0)
        if token.startswith("."):
            last = token[1:]
        elif last:
            sep = "-" if m.group(1) == "-" else "__"
            names.add(f"{last}{sep}{m.group(2)}")
    return names


def global_classes() -> set[str]:
    """Everything the design-system / app-level sheets define (those are shared already)."""
    out: set[str] = set()
    for scss in SRC.rglob("*.scss"):
        if is_global(scss):
            out |= with_amp_nesting(scss.read_text(errors="ignore"))
    return out
CLASSNAME = re.compile(r'className="([^"{}]+)"')


def is_global(scss: Path) -> bool:
    rel = scss.relative_to(SRC)
    return rel.parts[0] == "styles" or scss.name in GLOBAL_FILES


IMPORT = re.compile(r"""(?:from|import)\s*\(?\s*['"](\.[^'"]+)['"]""")
CLASS_LITERAL = re.compile(r"""className=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')""")


def module_files() -> list[Path]:
    return [p for p in SRC.rglob("*.tsx") if ".test." not in p.name and ".spec." not in p.name]


def resolve(base: Path, spec: str) -> Path | None:
    for suffix in ("", ".tsx", ".ts", "/index.tsx", "/index.ts"):
        candidate = (base.parent / f"{spec}{suffix}").resolve()
        if candidate.is_file():
            return candidate
    return None


def import_graph(files: list[Path]) -> dict[Path, set[Path]]:
    graph: dict[Path, set[Path]] = {}
    for path in files:
        graph[path] = {
            target
            for match in IMPORT.finditer(path.read_text(errors="ignore"))
            if (target := resolve(path, match.group(1))) is not None
        }
    return graph


def page_entries(graph: dict[Path, set[Path]]) -> list[Path]:
    """The page files a route mounts — every `import('./pages/…')` in App.tsx."""
    app = SRC / "App.tsx"
    return sorted(
        {
            target
            for match in re.finditer(r"""import\(['"]([^'"]+)['"]\)""", app.read_text(errors="ignore"))
            if (target := resolve(app, match.group(1))) is not None and "pages/" in str(target)
        }
    )


def pages_rendering(graph: dict[Path, set[Path]], pages: list[Path]) -> dict[Path, set[Path]]:
    """module → the routes that can render it (walk **down** each page's imports)."""
    out: dict[Path, set[Path]] = {}
    for page in pages:
        seen, stack = {page}, [page]
        while stack:
            for child in graph.get(stack.pop(), ()):
                if child not in seen:
                    seen.add(child)
                    stack.append(child)
        for module in seen:
            out.setdefault(module, set()).add(page)
    return out


def defined_locally() -> dict[str, set[str]]:
    """Page sheets only: a component's own sheet is loaded wherever the component is."""
    out: dict[str, set[str]] = collections.defaultdict(set)
    for scss in SRC.rglob("*.scss"):
        if is_global(scss) or "components/" in str(scss.relative_to(SRC)):
            continue
        for name in defined_here(scss.read_text(errors="ignore")):
            out[name].add(str(scss.relative_to(SRC)))
    return out


def offenders() -> dict[str, set[str]]:
    """class → the routes that use it, for classes only a page sheet defines."""
    owner = defined_locally()
    for name in global_classes():
        owner.pop(name, None)      # already global → a page override is not ownership

    files = module_files()
    graph = import_graph(files)
    routes = pages_rendering(graph, page_entries(graph))
    users: dict[str, set[str]] = collections.defaultdict(set)
    for tsx in files:
        rendering = routes.get(tsx)
        if not rendering or len(rendering) < 2:
            continue
        text = tsx.read_text(errors="ignore")
        used: set[str] = set()
        for match in CLASS_LITERAL.finditer(text):
            literal = next(g for g in match.groups() if g)
            used |= {token for token in literal.split() if token}
        for name in used & owner.keys():
            users[name] |= {str(page.relative_to(ROOT)) for page in rendering}
    return {name: routes for name, routes in users.items() if len(routes) > 1}


def main() -> int:
    found = offenders()

    if "--update-baseline" in sys.argv:
        BASELINE.write_text(
            "# Classes used from 2+ routes but defined in one route's SCSS. Frozen so the\n"
            "# list only shrinks; move a class to src/styles/ and delete its line here.\n"
            + "".join(f"{name}\n" for name in sorted(found))
        )
        print(f"wrote {BASELINE.name}: {len(found)} shared-but-local classes")
        return 0

    baseline = set()
    if BASELINE.exists():
        baseline = {
            line.strip()
            for line in BASELINE.read_text().splitlines()
            if line.strip() and not line.startswith("#")
        }

    new = sorted(set(found) - baseline)
    if "--list" in sys.argv:
        for name in sorted(found):
            print(f".{name}  used by {len(found[name])} routes: {sorted(found[name])}")
    if new:
        for name in new:
            print(f".{name}  used by {sorted(found[name])}")
        print(
            f"check-shared-styles: {len(new)} class(es) above are used from several routes "
            "but defined in one route's SCSS — move them to src/styles/",
            file=sys.stderr,
        )
        return 1
    print(f"check-shared-styles: shared-but-local classes OK ({len(baseline)} frozen)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
