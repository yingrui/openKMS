"""Parse list-query property filters (openKMS object/link list APIs)."""

from __future__ import annotations

import re

from fastapi import Request
from fastapi import HTTPException
from sqlalchemy import Text, cast

_PROP_NAME_RE = re.compile(r"^[a-zA-Z_][a-zA-Z0-9_]*$")


def parse_prop_filters(request: Request) -> dict[str, str]:
    """Read ``prop.<name>=value`` query params into a property equality map."""
    out: dict[str, str] = {}
    for key, value in request.query_params.multi_items():
        if not key.startswith("prop."):
            continue
        name = key[5:]
        if not name or not _PROP_NAME_RE.match(name):
            raise HTTPException(status_code=400, detail=f"Invalid property filter name: {name!r}")
        out[name] = value
    return out


def row_matches_prop_filters(data: dict | None, prop_filters: dict[str, str]) -> bool:
    """Equality match for dataset / in-memory paths (string compare)."""
    if not prop_filters:
        return True
    row = data or {}
    for name, expected in prop_filters.items():
        actual = row.get(name)
        if actual is None or str(actual) != expected:
            return False
    return True


def object_instance_conditions(model, prop_filters: dict[str, str], search: str | None) -> list:
    """WHERE conditions that read ``object_instances`` rows as object instances.

    Used when a type has no dataset and no Neo4j projection to read from: the apply-queue
    table is then the only place its objects live, so it must be listable/filterable the same
    way the Neo4j path is (`toString(n[key]) = value`, substring search over all properties).

    Values are bound parameters; a filter name is a JSONB key, so it is validated instead.
    """
    conditions: list = []
    needle = (search or "").strip()
    if needle:
        conditions.append(cast(model.data, Text).ilike(f"%{needle}%"))
    for name, expected in prop_filters.items():
        if not _PROP_NAME_RE.match(name):
            raise HTTPException(status_code=400, detail=f"Invalid property filter name: {name!r}")
        conditions.append(model.data[name].astext == expected)
    return conditions
