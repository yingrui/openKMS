"""Classify a failed query into the stable API error codes of `app/i18n/catalog.py`.

A query can fail for three reasons, and the Playground must say which:

- **definition** — the semantic model is wrong (expression is not an aggregate, field points at a
  column that no longer exists, …). The model author fixes this.
- **data** — the source refused or could not answer (grants, statement timeout, unreachable).
- **request** — the caller asked for something incoherent (unknown metric, order by a field that is
  not grouped). The caller fixes this.

Postgres tells us via SQLSTATE, so the mapping is data, not guesswork.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

QueryFailureKind = Literal["definition", "data", "request"]

DEFINITION: QueryFailureKind = "definition"
DATA: QueryFailureKind = "data"
REQUEST: QueryFailureKind = "request"


@dataclass(frozen=True)
class QueryFailure:
    """A stable message `code`, the `kind` of fix it needs, and the raw source text if any."""

    code: str
    kind: QueryFailureKind
    detail: str | None = None


#: SQLSTATE → (code, kind). Only the codes worth explaining; anything else falls back.
_BY_SQLSTATE: dict[str, tuple[str, QueryFailureKind]] = {
    "42601": ("QUERY_SYNTAX", DEFINITION),  # syntax_error
    "42703": ("QUERY_UNKNOWN_COLUMN", DEFINITION),  # undefined_column
    "42803": ("QUERY_METRIC_NOT_AGGREGATE", DEFINITION),  # grouping_error
    "42804": ("QUERY_TYPE_MISMATCH", DEFINITION),  # datatype_mismatch
    "42846": ("QUERY_TYPE_MISMATCH", DEFINITION),  # cannot_coerce
    "42883": ("QUERY_UNKNOWN_FUNCTION", DEFINITION),  # undefined_function
    "42P01": ("QUERY_UNKNOWN_TABLE", DEFINITION),  # undefined_table
    "42501": ("QUERY_PERMISSION_DENIED", DATA),  # insufficient_privilege
    "57014": ("QUERY_TIMEOUT", DATA),  # query_canceled
}
#: Connection-exception class: the source is not there at all.
_UNREACHABLE_CLASS = "08"


def sqlstate_of(exc: BaseException) -> str | None:
    """The SQLSTATE carried by a SQLAlchemy DBAPI error (psycopg: `.sqlstate`, `.pgcode`)."""
    origin: Any = getattr(exc, "orig", exc)
    for attr in ("sqlstate", "pgcode"):
        value = getattr(origin, attr, None)
        if isinstance(value, str) and value:
            return value
    return None


def classify_sql_error(exc: BaseException) -> QueryFailure:
    """Map a failed statement onto a stable code; the raw text rides along for the details line."""
    sqlstate = sqlstate_of(exc)
    detail = str(exc) or type(exc).__name__
    if sqlstate:
        known = _BY_SQLSTATE.get(sqlstate)
        if known:
            code, kind = known
            return QueryFailure(code, kind, detail)
        if sqlstate.startswith(_UNREACHABLE_CLASS):
            return QueryFailure("QUERY_SOURCE_UNREACHABLE", DATA, detail)
        if sqlstate.startswith("42"):
            # Any other syntax/access-rule error is still about the definition we compiled.
            return QueryFailure("QUERY_DEFINITION_INVALID", DEFINITION, detail)
    return QueryFailure("QUERY_FAILED", DATA, detail)
