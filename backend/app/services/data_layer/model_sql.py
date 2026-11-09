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
from app.services.data_layer.entity_scope import (
    EntityScope,
    EntityScopeError,
    compile_entity_scope,
)
from app.services.data_layer.sql_runner import run_readonly

MAX_SQL_CHARS = 20_000
DEFAULT_LIMIT = 100

#: Whitespace *and* comments: in SQL a comment is whitespace, so `FROM"t"` and `FROM/**/"t"` are both valid
#: PostgreSQL — and a regex that insists on `\s+` reads neither, which silently emptied the relation list (no allowlist
#: check, and no row restriction either). Anything that follows FROM/JOIN is now parsed, not pattern-matched.
_SKIP = re.compile(r"(?:\s+|--[^\n]*|/\*.*?\*/)+", re.S)
_KEYWORD = re.compile(r"\b(?:from|join)\b", re.I)
_NAME = re.compile(r'"(?:[^"]|"")*"|[A-Za-z_][\w$]*')


class RelationShapeError(ValueError):
    """A FROM/JOIN the scanner cannot read. Refused, because "not recognised" must never mean "unrestricted"."""


def mask_quoted(sql: str, *, identifiers: bool = True) -> str:
    """The same SQL with quoted text blanked out, same length, so offsets still line up.

    A keyword inside `'…'` (or inside `"…"`, a quoted identifier) is not code: `SELECT 'from here'` has no FROM, and
    rewriting it would put a subquery **inside the literal** — the user's value would change meaning, and `'joined from
    here'` was refused as "Table here is not in this semantic model". Double quotes are blanked for keyword finding only;
    the relation name itself is read from the original. `identifiers=False` keeps `"…"` visible — the guard against
    `schema.table.column` has to *see* quoted names to refuse them.
    """
    out = list(sql)
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        if ch == "'" or (ch == '"' and identifiers):
            quote = ch
            j = i + 1
            while j < n:
                if sql[j] == quote:
                    if j + 1 < n and sql[j + 1] == quote:  # '' and "" escape by doubling
                        j += 2
                        continue
                    j += 1
                    break
                j += 1
            for k in range(i, min(j, n)):
                out[k] = " "
            i = j
            continue
        if ch == "$":
            dollar = re.match(r"\$[A-Za-z_]*\$", sql[i:])
            if dollar:
                tag = dollar.group(0)
                close = sql.find(tag, i + len(tag))
                end = n if close < 0 else close + len(tag)
                for k in range(i, end):
                    out[k] = " "
                i = end
                continue
        i += 1
    return "".join(out)


def _skip_ws(sql: str, at: int) -> int:
    match = _SKIP.match(sql, at)
    return match.end() if match else at


def _parse_name(sql: str, at: int) -> tuple[str, int] | None:
    match = _NAME.match(sql, at)
    if not match:
        return None
    return match.group(0), match.end()


def relation_refs(sql: str) -> list[tuple[int, int, str | None, str]]:
    """`(start, end, schema_or_None, table)` for every relation after FROM / JOIN.

    Skips whitespace and comments, accepts a subquery `(SELECT …)` (its own FROM is scanned too, since every keyword is
    visited), and **raises** on anything else — `ONLY`, a parenthesised table name, a stray operator. The caller refuses
    the statement rather than running it unread: a relation the scanner missed is a table the allowlist never checked.
    """
    out: list[tuple[int, int, str | None, str]] = []
    masked = mask_quoted(sql)
    for match in _KEYWORD.finditer(masked):
        at = _skip_ws(sql, match.end())
        if at >= len(sql):
            raise RelationShapeError("SQL ends right after FROM/JOIN.")
        if sql[at] == "(":
            # A subquery: legal, and its relations are found by this same scan. A parenthesised *table name* is not.
            inner = _skip_ws(sql, at + 1)
            word = _NAME.match(sql, inner)
            if not word or word.group(0).lower() not in ("select", "with"):
                raise RelationShapeError(
                    "Wrap a subquery in FROM (SELECT …), or name the table directly: FROM schema.table."
                )
            continue
        only = _NAME.match(sql, at)
        if only and only.group(0).lower() == "only":
            raise RelationShapeError(
                "FROM ONLY is not supported in SQL Lab; drop ONLY (datasets never use table inheritance)."
            )
        parts: list[str] = []
        start: int | None = None
        end = at
        while True:
            parsed = _parse_name(sql, end)
            if not parsed:
                break
            name, end = parsed
            start = at if start is None else start
            parts.append(_unquote(name))
            after = _skip_ws(sql, end)
            if after < len(sql) and sql[after] == ".":
                end = _skip_ws(sql, after + 1)
                continue
            break
        if not parts:
            token = sql[at : at + 24].split()[0] if sql[at : at + 24].strip() else sql[at : at + 1]
            raise RelationShapeError(
                f"Cannot read the relation after {match.group(0).upper()} ({token!r}). "
                "Name the table as schema.table or quote it."
            )
        out.append((start, end, parts[-2] if len(parts) >= 2 else None, parts[-1]))
    return out


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
    try:
        return {(schema, table) for _s, _e, schema, table in relation_refs(sql)}
    except RelationShapeError as exc:
        raise QueryError(str(exc), QueryFailure("QUERY_INVALID_REQUEST", REQUEST)) from exc


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
    try:
        return [(start, end, schema or "", table) for start, end, schema, table in relation_refs(sql)]
    except RelationShapeError as exc:
        raise QueryError(str(exc), QueryFailure("QUERY_INVALID_REQUEST", REQUEST)) from exc


def _alias_after(sql: str, end: int) -> tuple[str, int] | None:
    """Return ``(alias, alias_end)`` for a relation alias at ``end``, or None."""
    match = _ALIAS_AFTER.match(sql, end)
    if not match:
        return None
    token = _unquote(match.group(1)).lower()
    if token in _NOT_ALIAS:
        return None
    return _unquote(match.group(1)), match.end()


def _base_table_alias(
    sql: str, base_schema: str | None, base_table: str | None
) -> str | None:
    """The alias already naming the base relation in ``sql``, or None when unaliased."""
    for _start, end, schema, table in _relation_span_matches(sql):
        if table.lower() == (base_table or "").lower() and (
            not schema or schema.lower() == (base_schema or "").lower()
        ):
            alias = _alias_after(sql, end)
            if alias is not None:
                return alias[0]
    return None


def constrain_base_policy(
    sql: str,
    *,
    base_schema: str | None,
    base_table: str | None,
    conditions: list[str],
    base_alias: str = "rpbase",
) -> str:
    """Constrain the base table's rows inside an arbitrary SELECT.

    Raw SQL cannot be rewritten generically, and an entity-level condition may live on a
    **different** table than the query's base, so the substitution has to give the base an
    alias the predicate can correlate to:

        FROM "s"."t"                ->  FROM "s"."t" AS rpbase
        FROM "s"."t" [AS a]         ->  FROM (SELECT * FROM "s"."t" AS rpbase
                                              WHERE <policy>) AS rpbase

    The inner relation carries the **same** alias the policy was compiled against. A condition
    on the base table is a plain `rpbase."c" = :p` and an entity-level one is an `EXISTS` that
    correlates to `rpbase`, so both need that name to resolve *inside* the subquery; letting the
    inner table stay unaliased left the predicate referring to a name that only existed outside
    it, which PostgreSQL rejected with `missing FROM-clause entry`.

    When the statement already names the base relation (Builder emits `FROM "s"."t" base`), the
    policy is compiled against **that** alias instead of ``rpbase`` and the relation is wrapped
    as ``(SELECT * FROM "s"."t" AS "base" WHERE <policy>) AS "base"``, so the caller's own
    qualified columns keep resolving.

    Two shapes are refused rather than run unfiltered: a statement addressing the base table
    through a schema-qualified column path (`"s"."t"."c"`), and a base reference whose existing
    alias differs from the one the policy was compiled against (renaming it would break that
    caller's own qualified columns).
    """
    if not conditions:
        return sql
    if not (base_schema and base_table):
        raise QueryError(
            "This model's base dataset has no physical table to constrain.",
            QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
        )
    for schema, table, _ in _QUALIFIED_REF.findall(mask_quoted(sql, identifiers=False)):
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
        # A statement that never reads the base table has no base rows to restrict (a dimension-only query, or one on
        # another model table). But if it *names* the restricted table and the scan still found no span, the scanner is
        # wrong — and running the statement plain would hand over exactly the rows the policy exists to hide.
        named = re.search(rf"\b{re.escape(base_table)}\b", sql, re.IGNORECASE)
        if named:
            raise QueryError(
                "SQL Lab could not apply a row restriction to this statement. "
                "Name the restricted table directly: FROM schema.table [AS rpbase].",
                QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
            )
        return sql

    where = " AND ".join(conditions)
    out = sql
    for start, end in sorted(spans, reverse=True):
        alias = _alias_after(out, end)
        span_end = end
        if alias is not None:
            # The statement already names this relation. If it used a different name than the
            # one the policy was compiled against, renaming it would silently break the
            # caller's own qualified columns, so that shape stays refused rather than leaked.
            name, span_end = alias
            if name.lower() != base_alias.lower():
                raise QueryError(
                    "SQL Lab could not apply a row restriction to this table: alias it as "
                    f"\"{base_alias}\" (e.g. FROM {base_schema}.{base_table} {base_alias}) "
                    "and reference its columns through that alias.",
                    QueryFailure("QUERY_INVALID_REQUEST", REQUEST),
                )
        filtered = (
            f'(SELECT * FROM {_quote(base_schema)}.{_quote(base_table)} AS "{base_alias}" '
            f"WHERE {where}) AS \"{base_alias}\""
        )
        out = out[:start] + filtered + out[span_end:]
    return out


def _has_relation(sql: str) -> bool:
    """Whether the statement reads at least one relation (a scanner refusal is the caller's to judge)."""
    try:
        return bool(relation_refs(sql))
    except RelationShapeError:
        return False


def _anchor_dataset_id(sql: str, datasets: list[Dataset]) -> str | None:
    """The model dataset a statement's first FROM relation refers to."""
    refs = _relation_span_matches(sql) if _has_relation(sql) else []
    if not refs:
        return None
    _start, _end, schema, table = refs[0]
    table = table.lower()
    schema = schema.lower() or None
    for dataset in datasets:
        if (dataset.table_name or "").lower() != table:
            continue
        if schema is None or (dataset.schema_name or "").lower() == schema:
            return dataset.id
    return None


def quote_ident(ident: str) -> str:
    return '"' + str(ident).replace('"', '""') + '"'


def _quote(ident: str) -> str:
    return quote_ident(ident)


async def run_model_sql(
    db: AsyncSession,
    *,
    model_id: str,
    sql: str,
    limit: int | None,
    member_dataset_ids: set[str] | None,
    base_dataset_id: str | None = None,
    entity_scope: EntityScope | None = None,
    base_alias: str = "rpbase",
) -> tuple[str, list[str], list[dict[str, Any]], bool, int]:
    """Run one SQL Lab statement. Returns ``(sql_run, columns, rows, capped, duration_ms)``.

    ``entity_scope`` restricts rows. Raw SQL cannot be rewritten generically, so the base table
    is given an alias and a policy compiled **against that alias** is applied; see
    ``constrain_base_policy`` for the shapes that are refused instead of run unfiltered.
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

    # The statement's first FROM relation is the anchor a row restriction correlates to.
    # Falling back to "apply to every table" would be wrong: an EXISTS needs one row identity.
    anchor_id = base_dataset_id or _anchor_dataset_id(body, datasets)
    base_dataset = next((d for d in datasets if d.id == anchor_id), None)
    if entity_scope is not None and entity_scope.policy and base_dataset is None:
        raise QueryError(
            "This statement does not read a model table as its FROM, so a row restriction "
            "cannot be applied to it.",
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
    if entity_scope is not None and entity_scope.policy:
        # Compile the policy against the alias the statement already names the base table
        # (Builder emits `FROM "s"."t" base`), falling back to the canonical one otherwise.
        effective_alias = (
            _base_table_alias(body, base_dataset.schema_name, base_dataset.table_name)
            or base_alias
        )
        try:
            policy_where, params = compile_entity_scope(
                entity_scope,
                base_dataset_id=base_dataset.id,
                base_alias=effective_alias,
                key_prefix="rp",
            )
        except EntityScopeError as exc:
            raise QueryError(str(exc), exc.failure) from exc
        constrained = constrain_base_policy(
            body,
            base_schema=base_dataset.schema_name,
            base_table=base_dataset.table_name,
            conditions=policy_where,
            base_alias=effective_alias,
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
