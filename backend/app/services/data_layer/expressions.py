"""Ossie expressions.

Canonical shape::

    {"dialects": [{"dialect": "ANSI_SQL", "expression": "<fragment>"}]}

Readers tolerate the legacy map form (`{"dialects": {"ANSI_SQL": "…"}}`) so a
half-migrated row still works; writers always emit the list form.
"""
from __future__ import annotations

from typing import Any

ANSI = "ANSI_SQL"


def dialect_sql(expression: dict | None, dialect: str = ANSI) -> str | None:
    """The SQL fragment for a dialect (list form, with legacy map fallback)."""
    if not isinstance(expression, dict):
        return None
    dialects = expression.get("dialects")
    if isinstance(dialects, list):
        for entry in dialects:
            if isinstance(entry, dict) and entry.get("dialect") == dialect:
                value = entry.get("expression")
                if isinstance(value, str):
                    return value
        return None
    if isinstance(dialects, dict):
        value = dialects.get(dialect)
        return value if isinstance(value, str) else None
    return None


def make_expression(sql: str, dialect: str = ANSI) -> dict[str, Any]:
    """Build an Ossie expression (list form) from a SQL fragment."""
    return {"dialects": [{"dialect": dialect, "expression": sql}]}


def all_dialects(expression: dict | None) -> list[dict[str, str]]:
    """Normalize any stored expression to the Ossie list form."""
    out: list[dict[str, str]] = []
    if not isinstance(expression, dict):
        return out
    dialects = expression.get("dialects")
    if isinstance(dialects, list):
        for entry in dialects:
            if (
                isinstance(entry, dict)
                and isinstance(entry.get("dialect"), str)
                and isinstance(entry.get("expression"), str)
            ):
                out.append({"dialect": entry["dialect"], "expression": entry["expression"]})
    elif isinstance(dialects, dict):
        for key, value in dialects.items():
            if isinstance(key, str) and isinstance(value, str):
                out.append({"dialect": key, "expression": value})
    return out


def validate_fragment(sql: str | None, *, what: str = "expression") -> str:
    """A single SQL fragment (no statement terminator, no comments)."""
    if not sql or not sql.strip():
        raise ValueError(f"A {what} is required.")
    if any(token in sql for token in (";", "--", "/*", "*/")):
        raise ValueError(f"The {what} must be a single SQL fragment (no ';' or comments).")
    return sql
