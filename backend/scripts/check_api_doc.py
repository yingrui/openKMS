#!/usr/bin/env python3
"""The API reference against the app's own route table — in one direction only.

A **documented route the app does not have** is a lie, and always a failure. That is the check.

The other direction — routes the reference does not describe — is deliberately **not** a failure. This
page is not a mirror of the route table: a table that enumerates 431 endpoints is the same kind of object
as the `data-models.md` that mirrored 88 tables by hand, and it drifted 93 routes in exactly the same way.
The complete, always-accurate list is generated: **`/openapi.json`**. This page carries the routes whose
*behaviour* needs explaining.

Earlier this check ratcheted the gap against a baseline. That made it possible to "fix" the number by
writing 85 one-line rows nobody verified — documentation theater, which is worse than an honest gap.

The route table is read from FastAPI itself (`app.routes`), not by parsing `@router` decorators: prefixes
come from `include_router(...)` in several places and routers are nested, so a static reader missed 99 real
routes and invented as many phantoms.

Run from `backend/`:  `uv run python scripts/check_api_doc.py`
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
REFERENCE = BACKEND.parent / "docs" / "features" / "api-reference.md"

#: FastAPI's own endpoints. They are infrastructure, not API surface.
INFRA = {"/docs", "/redoc", "/openapi.json", "/docs/oauth2-redirect"}
METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}

ROW = re.compile(r"\|\s*(GET|POST|PUT|PATCH|DELETE)\s*\|\s*`([^`?]+)")


def normalize(path: str) -> str:
    """One shape for both sides: parameters become `{}`, no trailing slash."""
    return re.sub(r"\{[^}]+\}", "{}", path.split("?")[0].rstrip("/")) or "/"


def app_routes() -> set[tuple[str, str]]:
    sys.path.insert(0, str(BACKEND))
    from app.main import app  # noqa: E402 — imported here so `--help` works without the app

    out: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        if normalize(path) in INFRA:
            continue
        for method in (getattr(route, "methods", None) or set()) & METHODS:
            out.add((method, normalize(path)))
    return out


def documented_routes() -> set[tuple[str, str]]:
    text = REFERENCE.read_text()
    return {(method, normalize(path)) for method, path in ROW.findall(text)}


def main() -> int:
    real, documented = app_routes(), documented_routes()
    ghosts = documented - real
    if ghosts:
        print(
            f"check-api-doc: {len(ghosts)} route(s) documented but not served — the reference is lying:",
            file=sys.stderr,
        )
        for method, path in sorted(ghosts):
            print(f"  {method:6} {path}", file=sys.stderr)
        return 1
    # Not a failure: the page is a curated subset, `/openapi.json` is the complete list.
    print(f"check-api-doc: OK ({len(real - documented)} route(s) served but not described here)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
