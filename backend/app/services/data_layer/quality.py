"""Run quality rules against a dataset's PostgreSQL table.

Every rule is one SQL query (see `rule_sql`): the five declarative types are generators that write the
same kind of query an author would, and `sql` is the same contract written by hand. This module is only
the "run it and record the verdict" half — the query construction and result reading are pure and live
next door, where they have tests.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.quality_rule import QualityRule
from app.services.data_layer.rule_sql import (
    RULE_TYPES,
    QualityError,
    RULE_SQL_TIMEOUT_MS,
    build_rule_query,
    interpret,
)
from app.services.data_layer.sql_runner import run_readonly_names
from app.services.ontology.dataset_tables import is_valid_identifier

__all__ = ["RULE_TYPES", "QualityError", "run_rule"]


def _quote_table(dataset: Dataset) -> str:
    if not (is_valid_identifier(dataset.schema_name) and is_valid_identifier(dataset.table_name)):
        raise QualityError("Invalid dataset table.")
    return f'"{dataset.schema_name}"."{dataset.table_name}"'


async def run_rule(db: AsyncSession, dataset: Dataset, rule: QualityRule) -> dict[str, Any]:
    """Execute a rule and return what the run measured."""
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise QualityError("Quality rules are only supported for PostgreSQL datasets.")

    table = _quote_table(dataset)
    ref_table: str | None = None
    if rule.rule_type == "referential":
        ref_id = (rule.config or {}).get("ref_dataset_id")
        ref = await db.get(Dataset, ref_id) if isinstance(ref_id, str) else None
        if ref is None:
            raise QualityError("The referenced dataset no longer exists.")
        ref_table = _quote_table(ref)

    built = build_rule_query(
        rule.rule_type,
        table=table,
        column=rule.column_name,
        config=rule.config or {},
        ref_table=ref_table,
    )
    try:
        names, rows = run_readonly_names(
            ds, built.sql, built.params, timeout_ms=RULE_SQL_TIMEOUT_MS
        )
    except QualityError:
        raise
    except Exception as exc:
        # A database error is a bad rule (400 + a recorded `error` run), not an unhandled 500 with a
        # traceback that quotes the SQL.
        raise QualityError(f"Rule execution failed: {exc}") from exc

    result = interpret(built.shape, names, rows, expect=built.expect)
    # What the run measured, the threshold it was judged against, and the SQL it used — the measurement
    # wins over the setting if they ever collide.
    result["detail"] = {**built.detail, **(result.get("detail") or {}), "sql": built.sql}
    return result

