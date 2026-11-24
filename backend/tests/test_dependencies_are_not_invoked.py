"""A FastAPI dependency is never called by hand.

`require_permission(...)` returns a dependency; awaiting its result passes FastAPI's own `Depends` object as the
first argument, so `db.get` becomes `Depends(get_db).get` and the request 500s — after the handler has already
decided the caller may proceed. Nothing catches that until someone takes the branch: the global layout was written
this way, and only a hand-run PUT found it.

The shape is mechanical, so the guard is too: a call of a call whose inner name is a dependency factory.
"""

from __future__ import annotations

import ast
from pathlib import Path

APP = Path(__file__).resolve().parent.parent / "app"
DEPENDENCY_FACTORIES = ("require_", "get_db", "get_current_user", "get_optional_user")


def _invoked_by_hand(tree: ast.AST) -> list[tuple[int, str]]:
    hits: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Call):
            continue
        inner = node.func.func
        name = getattr(inner, "id", None) or getattr(inner, "attr", None) or ""
        if name.startswith(DEPENDENCY_FACTORIES):
            hits.append((node.lineno, name))
    return hits


def test_no_route_calls_a_dependency_factory_by_hand():
    offenders = [
        f"{path.relative_to(APP)}:{line} calls {name}()()"
        for path in sorted(APP.rglob("*.py"))
        for line, name in _invoked_by_hand(ast.parse(path.read_text()))
    ]
    assert offenders == [], "\n".join(offenders)


def test_the_guard_recognises_the_shape_it_was_written_for():
    tree = ast.parse("async def h():\n    await require_permission('x')(request)\n")
    assert _invoked_by_hand(tree) == [(2, "require_permission")]
