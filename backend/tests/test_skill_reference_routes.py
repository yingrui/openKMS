"""The skill's route table is checked against the routes that exist.

`openkms-skill/references/REFERENCE.md` is written by hand, one row per CLI command, and nothing read it — a
renamed or deleted route left the table claiming something that answers 404. The backend knows the real table
(`app.openapi()`), so the two are compared here.

Three kinds of row, and each is checked differently:

* an absolute path — `(method, path)` must exist, with `{id}` / `{rule_id}` normalised (the parameter name is
  documentation, the segment position is the contract);
* a shorthand — `…/{version}/publish` — matched by suffix, because the row relies on a path written above it;
* a row that is not a route at all (`ontology ask` is a chain of calls, `api spec` reads `/openapi.json`) — those
  are named in `NOT_ROUTES`, so adding one is a decision rather than an omission.
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

REFERENCE = Path(__file__).resolve().parents[2] / "openkms-skill" / "references" / "REFERENCE.md"

METHOD_RE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE)\b")
PATH_RE = re.compile(r"(?P<shorthand>…)?(?P<path>(?:/api)?/[A-Za-z0-9_\-{}/.]+)")

#: Rows whose right-hand column is deliberately not a route.
NOT_ROUTES = {
    "`api spec`": "reads /openapi.json — the route table itself",
    "`ontology ask`": "a chain of three calls, each listed on its own row",
}


def normalise(path: str) -> str:
    return re.sub(r"\{[^}]*\}", "{}", path).rstrip(".,;")


@pytest.fixture(scope="module")
def routes() -> set[tuple[str, str]]:
    from app.main import app

    return {
        (method.upper(), normalise(path))
        for path, operations in app.openapi()["paths"].items()
        for method in operations
        if method in ("get", "post", "put", "patch", "delete")
    }


def rows() -> list[tuple[str, list[str], list[tuple[str, str, str]]]]:
    """(cli, methods, [(shorthand|'', path)]) for every table row in REFERENCE.md."""
    assert REFERENCE.exists(), f"skill reference missing: {REFERENCE}"
    out = []
    for line in REFERENCE.read_text().splitlines():
        if not line.startswith("|"):
            continue
        cells = [cell.strip() for cell in line.strip().strip("|").split("|")]
        if len(cells) < 3 or cells[0] == "CLI" or set(cells[0]) <= {"-"}:
            continue
        methods = [m for cell in cells[1:3] for m in METHOD_RE.findall(cell)]
        paths = [
            (m.group("shorthand") or "", m.group("path"))
            for cell in cells[1:3]
            for m in PATH_RE.finditer(cell)
        ]
        out.append((cells[0], methods, paths))
    return out


def test_the_table_is_read_at_all():
    """A parser that finds nothing would pass every check below — this is the anti-vacuity guard."""
    parsed = [row for row in rows() if row[2]]
    assert len(parsed) >= 250, f"only {len(parsed)} rows carried a path — did the table format change?"


def test_every_absolute_path_exists(routes):
    missing: list[str] = []
    for cli, methods, paths in rows():
        if cli in NOT_ROUTES:
            continue
        for shorthand, path in paths:
            if shorthand or method_is_ambiguous(methods, len(paths)):
                continue
            for method in methods:
                if (method, normalise(path)) not in routes:
                    missing.append(f"{method} {path}  ← {cli}")
    assert not missing, "REFERENCE.md names routes the backend does not serve:\n" + "\n".join(missing)


def method_is_ambiguous(methods: list[str], path_count: int) -> bool:
    """A row with several methods and several paths cannot be paired up here — it is a chain, not a route."""
    return len(methods) > 1 and path_count > 1


def test_every_shorthand_matches_a_real_path(routes):
    """`…/{version}/publish` leans on a path written above it, so only its tail can be checked."""
    missing: list[str] = []
    for cli, methods, paths in rows():
        for shorthand, path in paths:
            if not shorthand:
                continue
            tail = normalise(path)
            for method in methods:
                if not any(m == method and p.endswith(tail) for m, p in routes):
                    missing.append(f"{method} …{path}  ← {cli}")
    assert not missing, (
        "REFERENCE.md shorthand paths match no served route:\n" + "\n".join(missing)
    )


def test_rows_that_are_not_routes_are_named():
    unexplained = [
        cli
        for cli, _methods, paths in rows()
        if not paths and cli not in NOT_ROUTES
    ]
    assert not unexplained, (
        "these rows name neither a path nor a reason: "
        f"{unexplained} — add them to NOT_ROUTES"
    )
