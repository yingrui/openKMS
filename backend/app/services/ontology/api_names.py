"""Readable, frozen identifiers for ontology object types and link types.

A row's ``id`` is an opaque UUID — it answers "which row". Code needs the other half of the
pair: a name an author can type into a Function, read in a diff, and put in a Cypher label
(``client("WorkItem")``, ``MATCH (n:WorkItem)``). That name is fixed when the type is created,
because published Function source holds it as a string; renaming it would break the callers.

Everything here is pure so the create/rename rules are testable without a database.
"""

from __future__ import annotations

import re

API_NAME_MAX_LENGTH = 128

_API_NAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]*$")
_SPLIT_RE = re.compile(r"[^A-Za-z0-9]+")


class ApiNameError(ValueError):
    """A name the caller has to fix (surfaced as HTTP 400 by the API)."""


def is_valid_api_name(value: str | None) -> bool:
    return bool(value) and len(value) <= API_NAME_MAX_LENGTH and bool(_API_NAME_RE.match(value))


def derive_api_name(display_name: str | None) -> str | None:
    """A valid identifier candidate from a display name, or None when there is nothing to build from.

    A name that is *already* a valid identifier is kept verbatim (``governed_by`` must not turn
    into ``GovernedBy`` — existing Functions call it by that string). Otherwise the ASCII runs are
    joined in PascalCase (``Stock.Daily Bar`` → ``StockDailyBar``).

    A name with no ASCII characters (e.g. 中文) has no candidate: the author supplies one, because
    the identifier is a contract and a generated ``Type_a1b2c3`` would be a worse one.
    """
    if is_valid_api_name(display_name):
        return display_name  # type: ignore[return-value]
    parts = [p for p in _SPLIT_RE.split(display_name or "") if p]
    if not parts:
        return None
    candidate = "".join(p[:1].upper() + p[1:] for p in parts)[:API_NAME_MAX_LENGTH]
    if not candidate[:1].isalpha():
        candidate = f"Type{candidate}"[:API_NAME_MAX_LENGTH]
    return candidate


def unique_api_name(base: str, taken: set[str]) -> str:
    """`base`, or `base_2`, `base_3`, … — never a silent clash between two types."""
    if base not in taken:
        return base
    for i in range(2, 1000):
        suffix = f"_{i}"
        candidate = base[: API_NAME_MAX_LENGTH - len(suffix)] + suffix
        if candidate not in taken:
            return candidate
    raise ApiNameError(f"Too many types share the api_name stem {base!r}")


def resolve_api_name(*, requested: str | None, display_name: str, taken: set[str]) -> str:
    """The api_name for a row being created (or a legacy row claiming one).

    ``requested`` wins when the author typed one; otherwise it is derived from the display name.
    """
    if requested is not None and requested.strip():
        candidate = requested.strip()
        if not is_valid_api_name(candidate):
            raise ApiNameError(
                "api_name must start with a letter and contain only letters, digits and "
                f"underscores (max {API_NAME_MAX_LENGTH} characters)"
            )
        if candidate in taken:
            raise ApiNameError(f"api_name {candidate!r} is already used by another type")
        return candidate
    derived = derive_api_name(display_name)
    if derived is None:
        raise ApiNameError(
            "This name has no ASCII characters to build an api_name from. "
            "Supply api_name explicitly (the name code and Cypher use for this type)."
        )
    return unique_api_name(derived, taken)
