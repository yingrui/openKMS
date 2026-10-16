"""Row filters for the Data tab's grid: a column, a whitelisted operator, a value.

The grid filters a **table's physical columns** (the Playground filters a model's declared fields —
two address spaces, one operator vocabulary). Everything here is pure so the rules are testable:
identifiers are validated, operators come from the shared whitelist, and values are parameterized
downstream by `build_conditions` — this module only decides *what* is legal to ask.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.services.data_layer.query_errors import (
    REQUEST,
    QueryFailure,
    QueryFailureKind,
)
from app.services.data_layer.sql_build import VALID_OPS, SqlBuildError, build_conditions
from app.services.ontology.dataset_tables import is_valid_identifier

#: A filter bar with more than this many conditions is a query, not browsing.
MAX_FILTERS = 10


class RowFilterError(ValueError):
    """A filter the grid should not have sent; carries the localized code to answer with."""

    def __init__(self, message: str, failure: QueryFailure) -> None:
        super().__init__(message)
        self.failure = failure

    @property
    def code(self) -> str:
        return self.failure.code

    @property
    def kind(self) -> QueryFailureKind:
        return self.failure.kind

    @property
    def detail(self) -> str | None:
        return self.failure.detail


@dataclass(frozen=True)
class RowFilter:
    """One `column op value` condition, already validated against the table."""

    column: str
    op: str
    value: Any


def _failure(code: str, kind: QueryFailureKind, detail: str, **params: Any) -> QueryFailure:
    return QueryFailure(code, kind, detail, params=params)


def parse_row_filters(
    filters: list[dict[str, Any]] | None,
    columns: set[str] | None = None,
) -> list[RowFilter]:
    """Validate the request's filters against the table's columns.

    ``columns`` is the live column set of the table; ``None`` skips the membership check (the
    database will then refuse an unknown column, and that comes back as a `data` failure).
    Raises `RowFilterError` with a stable code for anything the *caller* got wrong.
    """
    if not filters:
        return []
    if len(filters) > MAX_FILTERS:
        raise RowFilterError(
            f"Too many filters ({len(filters)} > {MAX_FILTERS}).",
            _failure(
                "DATASET_ROWS_TOO_MANY_FILTERS",
                REQUEST,
                f"{len(filters)} filters, at most {MAX_FILTERS}",
                max=MAX_FILTERS,
            ),
        )

    parsed: list[RowFilter] = []
    for raw in filters:
        if not isinstance(raw, dict):
            raise RowFilterError("A filter must be an object.", _failure("DATASET_ROWS_INVALID_FILTER", REQUEST, str(raw)))
        column = raw.get("field") or raw.get("column")
        op = raw.get("op")
        if not isinstance(column, str) or not column.strip():
            raise RowFilterError(
                "A filter needs a column.",
                _failure("DATASET_ROWS_INVALID_FILTER", REQUEST, "missing column"),
            )
        if not is_valid_identifier(column):
            raise RowFilterError(
                f"Invalid column name '{column}'.",
                _failure("DATASET_ROWS_UNKNOWN_COLUMN", REQUEST, column, column=column),
            )
        if columns is not None and column not in columns:
            raise RowFilterError(
                f"'{column}' is not a column of this table.",
                _failure("DATASET_ROWS_UNKNOWN_COLUMN", REQUEST, column, column=column),
            )
        if not isinstance(op, str) or op not in VALID_OPS:
            raise RowFilterError(
                f"Unsupported operator '{op}'.",
                _failure("DATASET_ROWS_BAD_OPERATOR", REQUEST, str(op), op=str(op)),
            )
        parsed.append(RowFilter(column=column, op=op, value=raw.get("value")))
    return parsed


def build_row_where(filters: list[RowFilter] | None) -> tuple[list[str], dict[str, Any]]:
    """``(where clauses, params)`` for the filters — parameterized, so no value is ever SQL."""
    conditions = [(f'"{f.column}"', f.op, f.value) for f in filters or []]
    try:
        return build_conditions(conditions)
    except SqlBuildError as exc:
        # A shape the whitelist cannot express (e.g. `in` without a list) is the caller's mistake.
        raise RowFilterError(str(exc), _failure("DATASET_ROWS_INVALID_FILTER", REQUEST, str(exc))) from exc


__all__ = [
    "MAX_FILTERS",
    "RowFilter",
    "RowFilterError",
    "build_row_where",
    "parse_row_filters",
]
