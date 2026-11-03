"""SQL Lab for a semantic model — one read-only SELECT against the model's tables.

Safety is layered: SELECT/WITH shape check, model table allowlist, single data
source, then ``run_readonly`` (READ ONLY txn + statement timeout) + outer LIMIT.
Not a full SQL ACL product — callers must stay within listed schema.table names.
"""
from __future__ import annotations

import re
import time
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.data_layer.metrics import DEFAULT_ROW_CAP, DEFAULT_TIMEOUT_MS
from app.services.data_layer.query import QueryError
from app.services.data_layer.query_errors import DATA, REQUEST, QueryFailure, classify_sql_error
from app.services.data_layer.sql_runner import run_readonly

MAX_SQL_CHARS = 20_000
DEFAULT_LIMIT = 100

# Relation after FROM / JOIN / UPDATE / INTO — skip subquery ``(``.
_RELATION = re.compile(
    r"""(?ix)
    \b(?:from|join|update|into)\s+
    (?!\()
    (
      (?:(?:"[^"]+"|[A-Za-z_][\w$]*)\s*\.\s*)?
      (?:"[^"]+"|[A-Za-z_][\w$]*)
    )
    """
)


def normalize_lab_sql(sql: str) -> str:
    """Shape-check a SQL Lab body: one SELECT / WITH … SELECT, no second statement."""
    body = (sql or "").strip().rstrip(";").strip()
    if not body:
        raise QueryError(
            "A SQL Lab query needs a statement.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    if len(body) > MAX_SQL_CHARS:
        raise QueryError(
            f"SQL must be under {MAX_SQL_CHARS} characters.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    if ";" in body:
        raise QueryError(
            "SQL Lab allows a single statement.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    head = body.lstrip("(").split(None, 1)[0].lower() if body.strip() else ""
    if head not in ("select", "with"):
        raise QueryError(
            "SQL Lab must be a SELECT (or a WITH … SELECT).",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    return body


def _unquote(ident: str) -> str:
    s = ident.strip()
    if len(s) >= 2 and s[0] == '"' and s[-1] == '"':
        return s[1:-1].replace('""', '"')
    return s


def extract_relations(sql: str) -> set[tuple[str | None, str]]:
    """Physical relations referenced after FROM/JOIN/UPDATE/INTO.

    Returns ``{(schema_or_None, table)}`` with identifiers unquoted. Schema-less
    names use ``None`` for schema (resolved against the allowlist's default).
    """
    out: set[tuple[str | None, str]] = set()
    for match in _RELATION.finditer(sql):
        raw = match.group(1)
        parts = [p.strip() for p in re.split(r"\s*\.\s*", raw) if p.strip()]
        if len(parts) == 1:
            out.add((None, _unquote(parts[0])))
        elif len(parts) >= 2:
            out.add((_unquote(parts[-2]), _unquote(parts[-1])))
    return out


def _allowed_keys(datasets: list[Dataset]) -> dict[tuple[str, str], Dataset]:
    """Map ``(schema.lower(), table.lower())`` → dataset for allowlist checks."""
    allowed: dict[tuple[str, str], Dataset] = {}
    for ds in datasets:
        if not ds.schema_name or not ds.table_name:
            continue
        key = (ds.schema_name.lower(), ds.table_name.lower())
        allowed[key] = ds
    return allowed


def assert_tables_allowed(sql: str, datasets: list[Dataset]) -> None:
    """Every physical table in ``sql`` must be one of the model's datasets."""
    allowed = _allowed_keys(datasets)
    if not allowed:
        raise QueryError(
            "This model has no table datasets to query.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    # Unqualified names: only unambiguous when every allowed table shares one schema
    # or the name is unique across the allowlist.
    by_table: dict[str, list[tuple[str, str]]] = {}
    for schema, table in allowed:
        by_table.setdefault(table, []).append((schema, table))

    for schema, table in extract_relations(sql):
        tkey = table.lower()
        if schema is not None:
            key = (schema.lower(), tkey)
            if key not in allowed:
                raise QueryError(
                    f"Table {schema}.{table} is not in this semantic model.",
                    QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
                )
            continue
        matches = by_table.get(tkey, [])
        if len(matches) == 1:
            continue
        if not matches:
            raise QueryError(
                f"Table {table} is not in this semantic model.",
                QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
            )
        raise QueryError(
            f"Table name {table} is ambiguous — use schema.table.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )


def wrap_with_limit(sql: str, limit: int) -> str:
    """Enforce the row cap with an outer SELECT … LIMIT (preserves inner ORDER BY)."""
    n = max(1, min(int(limit), DEFAULT_ROW_CAP))
    return f"SELECT * FROM (\n{sql}\n) AS _ok_sql_lab LIMIT {n}"


async def run_model_sql(
    db: AsyncSession,
    *,
    model_id: str,
    sql: str,
    limit: int | None,
    member_dataset_ids: set[str] | None,
) -> tuple[str, list[str], list[dict[str, Any]], bool, int]:
    """Run one SQL Lab statement. Returns ``(sql_run, columns, rows, capped, duration_ms)``."""
    body = normalize_lab_sql(sql)
    lim = DEFAULT_LIMIT if limit is None else max(1, min(int(limit), DEFAULT_ROW_CAP))

    if not member_dataset_ids:
        raise QueryError(
            "This model has no datasets.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )

    rows_ds = (
        await db.execute(select(Dataset).where(Dataset.id.in_(member_dataset_ids)))
    ).scalars().all()
    datasets = [d for d in rows_ds if d.kind == "table"]
    if not datasets:
        raise QueryError(
            "This model has no table datasets to query.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )

    source_ids = {d.data_source_id for d in datasets}
    if len(source_ids) != 1:
        raise QueryError(
            "SQL Lab requires every model dataset to share one data source.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )

    assert_tables_allowed(body, datasets)

    ds = await db.get(DataSource, next(iter(source_ids)))
    if not ds or ds.kind != "postgresql":
        raise QueryError(
            "Queries only run on PostgreSQL datasets.",
            QueryFailure("QUERY_UNSUPPORTED_SOURCE", DATA),
        )

    capped_sql = wrap_with_limit(body, lim)
    # Fetch one extra row to detect the cap without a second round-trip.
    probe_sql = wrap_with_limit(body, lim + 1)

    started = time.monotonic()
    try:
        result_rows = run_readonly(ds, probe_sql, {}, timeout_ms=DEFAULT_TIMEOUT_MS)
    except SQLAlchemyError as exc:
        raise QueryError(
            str(exc),
            classify_sql_error(exc),
        ) from exc
    duration = int((time.monotonic() - started) * 1000)

    capped = len(result_rows) > lim
    rows = result_rows[:lim]
    columns = list(rows[0].keys()) if rows else (
        list(result_rows[0].keys()) if result_rows else []
    )
    return capped_sql, columns, rows, capped, duration
