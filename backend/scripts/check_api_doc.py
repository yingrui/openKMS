#!/usr/bin/env python3
"""The API reference against the app's own route table.

Hand-maintained route tables drift, and the two directions are not equally bad:

- a **documented route the app does not have** is a lie — always a failure, no baseline;
- a **route the reference does not describe** is a gap — real, but it accrues, so it is ratcheted
  against `scripts/api-doc-baseline.txt`, which may only shrink.

The route table is read from FastAPI itself (`app.routes`), not by parsing `@router` decorators: prefixes
come from `include_router(..., prefix=…)` in several places and routers are nested, so a static reader
silently misses routes — which is exactly how the first version of this comparison produced 99 phantom
"documented but missing" entries.

Run from `backend/`:  `uv run python scripts/check_api_doc.py [--update-baseline]`
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
BASELINE = BACKEND / "scripts" / "api-doc-baseline.txt"
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


def load_baseline() -> set[tuple[str, str]]:
    if not BASELINE.exists():
        return set()
    lines = [ln.strip() for ln in BASELINE.read_text().splitlines() if ln.strip() and not ln.startswith("#")]
    return {(ln.split(" ", 1)[0], ln.split(" ", 1)[1]) for ln in lines}


def write_baseline(missing: set[tuple[str, str]]) -> None:
    body = "\n".join(f"{m} {p}" for m, p in sorted(missing))
    header = (
        "# Routes the app serves that docs/features/api-reference.md does not describe.\n"
        "# Frozen so the list only shrinks: document a route and delete its line.\n"
        "# Regenerate: uv run python scripts/check_api_doc.py --update-baseline\n"
    )
    BASELINE.write_text(header + body + "\n")


def main() -> int:
    real, documented = app_routes(), documented_routes()
    missing = real - documented
    ghosts = documented - real

    if "--update-baseline" in sys.argv:
        write_baseline(missing)
        print(f"check-api-doc: baseline written with {len(missing)} route(s)")
        return 0

    status = 0
    if ghosts:
        print(
            f"check-api-doc: {len(ghosts)} route(s) documented but not served — the reference is lying:",
            file=sys.stderr,
        )
        for method, path in sorted(ghosts):
            print(f"  {method:6} {path}", file=sys.stderr)
        status = 1

    grown = missing - load_baseline()
    if grown:
        print(
            f"check-api-doc: {len(grown)} new route(s) not in api-reference.md (baseline: "
            f"{len(load_baseline())}, now {len(missing)}) — document them, or regenerate the baseline:",
            file=sys.stderr,
        )
        for method, path in sorted(grown):
            print(f"  {method:6} {path}", file=sys.stderr)
        status = 1

    if status == 0:
        print(f"check-api-doc: OK ({len(missing)} undocumented, frozen at baseline)")
    return status


if __name__ == "__main__":
    sys.exit(main())
