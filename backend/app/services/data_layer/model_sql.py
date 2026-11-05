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
from app.services.data_layer.row_policy import policy_conditions
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


#: Tokens that follow a relation without being its alias.
_NOT_ALIAS = frozenset(
    """
    where on join inner left right full outer cross natural using group order limit
    offset having union intersect except window qualify fetch for tablesample
    """.split()
)
_ALIAS_AFTER = re.compile(r"\s+(?:as\s+)?(\"[^\"]+\"|[A-Za-z_][\w$]*)", re.IGNORECASE)
_QUALIFIED_REF = re.compile(
    r"""(\"[^\"]+\"|[A-Za-z_][\w$]*)\s*\.\s*(\"[^\"]+\"|[A-Za-z_][\w$]*)\s*\.\s*(\"[^\"]+\"|[A-Za-z_][\w$]*)"""
)


def _relation_span_matches(sql: str) -> list[tuple[int, int, str, str | None]]:
    """`(start, end, schema_or_empty, table)` for each FROM/JOIN relation, with its span."""
    out: list[tuple[int, int, str, str | None]] = []
    for match in _RELATION.finditer(sql):
        raw = match.group(1)
        parts = [p.strip() for p in re.split(r"\s*\.\s*", raw) if p.strip()]
        if len(parts) == 1:
            out.append((match.start(1), match.end(1), "", _unquote(parts[0])))
        else:
            out.append((match.start(1), match.end(1), _unquote(parts[-2]), _unquote(parts[-1])))
    return out


def _has_alias(sql: str, end: int) -> bool:
    alias = _ALIAS_AFTER.match(sql, end)
    if not alias:
        return False
    token = _unquote(alias.group(1)).lower()
    return token not in _NOT_ALIAS


def constrain_base_policy(
    sql: str,
    *,
    base_schema: str | None,
    base_table: str | None,
    conditions: list[str],
    key_prefix: str = "rp",
) -> str:
    """Replace every reference to the base table with its row-filtered subquery.

    Raw SQL has no generic rewrite, so the safe move is a **substitution that keeps the
    table's own name as the alias**: ``FROM "s"."t" x`` becomes
    ``FROM (SELECT * FROM "s"."t" WHERE <policy>) AS x``. A statement that addresses the
    base table's columns through a schema-qualified path (``"s"."t"."c"``) cannot keep
    working after that substitution, so it is refused instead of run unfiltered.
    """
    if not conditions:
        return sql
    if not (base_schema and base_table):
        raise QueryError(
            "This model's base dataset has no physical table to constrain.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    for schema, table, _ in _QUALIFIED_REF.findall(sql):
        if (
            _unquote(schema).lower() == base_schema.lower()
            and _unquote(table).lower() == base_table.lower()
        ):
            raise QueryError(
                "This query addresses the restricted table as schema.table.column; "
                "reference its columns unqualified or through an alias.",
                QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
            )

    spans = [
        (start, end)
        for start, end, schema, table in _relation_span_matches(sql)
        if table.lower() == base_table.lower()
        and (not schema or schema.lower() == base_schema.lower())
    ]
    if not spans:
        # Dimension-only statements carry no base rows, so no policy to apply.
        return sql

    where = " AND ".join(conditions)
    filtered = f'(SELECT * FROM "{base_schema}"."{base_table}" WHERE {where})'
    out = sql
    for start, end in sorted(spans, reverse=True):
        original = out[start:end]
        replacement = filtered if _has_alias(out, end) else f'{filtered} AS "{base_table}"'
        out = out[:start] + replacement + out[end:]
        del original
    return out


async def run_model_sql(
    db: AsyncSession,
    *,
    model_id: str,
    sql: str,
    limit: int | None,
    member_dataset_ids: set[str] | None,
    base_dataset_id: str | None = None,
    row_policy: list[dict[str, Any]] | None = None,
    policy_claims: dict[str, Any] | None = None,
) -> tuple[str, list[str], list[dict[str, Any]], bool, int]:
    """Run one SQL Lab statement. Returns ``(sql_run, columns, rows, capped, duration_ms)``.

    ``row_policy`` constrains the model's **base table**. Raw SQL cannot be rewritten
    generically, so the policy is enforced by running the statement against a filtered
    subquery of each allowlisted table that the statement names: every base-table reference
    is replaced by ``(SELECT * FROM base WHERE <policy>) AS "schema"."table"``. A statement
    that names the base table in a shape this rewrite cannot express is refused rather than
    run unfiltered.
    """
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

    base_dataset = next(
        (d for d in datasets if base_dataset_id and d.id == base_dataset_id), None
    )
    if row_policy and base_dataset is None:
        raise QueryError(
            "The model's base dataset is not among its table datasets.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )

    ds = await db.get(DataSource, next(iter(source_ids)))
    if not ds or ds.kind != "postgresql":
        raise QueryError(
            "Queries only run on PostgreSQL datasets.",
            QueryFailure("QUERY_UNSUPPORTED_SOURCE", DATA),
        )

    params: dict[str, Any] = {}
    constrained = body
    if row_policy:
        policy_where, params = policy_conditions(
            row_policy, alias=None, claims=policy_claims or {}, key_prefix="rp"
        )
        constrained = constrain_base_policy(
            body,
            base_schema=base_dataset.schema_name,
            base_table=base_dataset.table_name,
            conditions=policy_where,
        )

    capped_sql = wrap_with_limit(constrained, lim)
    # Fetch one extra row to detect the cap without a second round-trip.
    probe_sql = wrap_with_limit(constrained, lim + 1)

    started = time.monotonic()
    try:
        result_rows = run_readonly(ds, probe_sql, params, timeout_ms=DEFAULT_TIMEOUT_MS)
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
