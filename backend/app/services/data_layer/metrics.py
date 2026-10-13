"""Compute a metric by querying the dataset table on demand.

The metric is a **declarative DSL**: aggregation + column + filters + registered
joins + dimensions. The SQL is generated here; callers never supply raw SQL.
``build_metric_sql`` is pure (no DB) and unit-tested.
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.models.metric_definition import MetricDefinition
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource
from app.services.ontology.property_types import serialize_cell_value

AGGREGATIONS = ("count", "sum", "avg", "min", "max")
_OP_MAP = {"=": "=", "!=": "<>", ">": ">", ">=": ">=", "<": "<", "<=": "<=", "like": "LIKE"}
VALID_OPS = tuple(_OP_MAP) + ("in", "not_in", "is_null", "is_not_null")


class MetricError(ValueError):
    """Raised when a metric cannot be computed; surfaced as HTTP 400."""


def build_metric_sql(
    dataset: Dataset,
    metric: MetricDefinition,
    *,
    joins_by_id: dict[str, DatasetJoin],
    datasets_by_id: dict[str, Dataset],
) -> tuple[str, dict[str, Any]]:
    """Build ``(sql, params)`` for a metric. Raises :class:`MetricError` on invalid input."""
    agg = (metric.aggregation or "").lower()
    if agg not in AGGREGATIONS:
        raise MetricError(f"Unsupported aggregation '{metric.aggregation}'.")
    col = metric.column_name
    if col and not is_valid_identifier(col):
        raise MetricError("Invalid column name.")
    if agg != "count" and not col:
        raise MetricError("A valid column is required for this aggregation.")
    if agg == "count" and not col:
        agg_expr = "COUNT(*)"
    else:
        agg_expr = f'{agg.upper()}("{col}")' if agg != "count" else f'COUNT("{col}")'

    joins_sql: list[str] = []
    for i, join_id in enumerate(metric.joins or []):
        join = joins_by_id.get(join_id)
        if not join:
            raise MetricError(f"Relationship '{join_id}' not found.")
        if join.from_dataset_id == dataset.id:
            other_id, metric_is_from = join.to_dataset_id, True
        elif join.to_dataset_id == dataset.id:
            other_id, metric_is_from = join.from_dataset_id, False
        else:
            raise MetricError(f"Relationship '{join_id}' does not touch this dataset.")
        other = datasets_by_id.get(other_id)
        if not other:
            raise MetricError("Joined dataset not found.")
        if not (is_valid_identifier(other.schema_name) and is_valid_identifier(other.table_name)):
            raise MetricError("Invalid joined table.")
        alias = f"j{i}"
        from_cols = list(join.from_columns or [])
        to_cols = list(join.to_columns or [])
        if len(from_cols) != len(to_cols) or not from_cols:
            raise MetricError("Relationship columns are not aligned.")
        ons: list[str] = []
        for s, t in zip(from_cols, to_cols):
            if not (
                isinstance(s, str)
                and isinstance(t, str)
                and is_valid_identifier(s)
                and is_valid_identifier(t)
            ):
                raise MetricError("Invalid relationship column.")
            # metric dataset is `from` → base.from_col = other.to_col; else base.to_col = other.from_col
            ons.append(
                f'base."{s}" = {alias}."{t}"' if metric_is_from else f'base."{t}" = {alias}."{s}"'
            )
        join_kind = (join.join_type or "left").upper()
        if join_kind not in ("LEFT", "INNER", "RIGHT", "FULL"):
            join_kind = "LEFT"
        joins_sql.append(
            f'{join_kind} JOIN "{other.schema_name}"."{other.table_name}" {alias} ON '
            + " AND ".join(ons)
        )

    params: dict[str, Any] = {}
    where: list[str] = []
    for i, f in enumerate(metric.filters or []):
        c, op, val = f.get("column"), f.get("op"), f.get("value")
        if not (isinstance(c, str) and is_valid_identifier(c)):
            raise MetricError("Invalid filter column.")
        if op not in VALID_OPS:
            raise MetricError(f"Unsupported operator '{op}'.")
        qcol = f'base."{c}"'
        if op == "is_null":
            where.append(f"{qcol} IS NULL")
        elif op == "is_not_null":
            where.append(f"{qcol} IS NOT NULL")
        elif op in ("in", "not_in"):
            if not isinstance(val, list):
                raise MetricError("IN filter value must be a list.")
            keys: list[str] = []
            for j, v in enumerate(val):
                k = f"f{i}_{j}"
                params[k] = v
                keys.append(f":{k}")
            where.append(f"{qcol} {'IN' if op == 'in' else 'NOT IN'} ({', '.join(keys)})")
        else:
            k = f"f{i}"
            params[k] = val
            where.append(f"{qcol} {_OP_MAP[op]} :{k}")

    dims: list[str] = []
    for d in metric.dimensions or []:
        if not (isinstance(d, str) and is_valid_identifier(d)):
            raise MetricError("Invalid dimension.")
        dims.append(f'base."{d}"')

    select = [*dims, f"{agg_expr} AS value"]
    sql = f'SELECT {", ".join(select)} FROM "{dataset.schema_name}"."{dataset.table_name}" base'
    if joins_sql:
        sql += " " + " ".join(joins_sql)
    if where:
        sql += " WHERE " + " AND ".join(where)
    if dims:
        sql += " GROUP BY " + ", ".join(dims)
    return sql, params


async def compute_metric(db: AsyncSession, metric: MetricDefinition) -> list[dict[str, Any]]:
    dataset = await db.get(Dataset, metric.dataset_id)
    if not dataset:
        raise MetricError("Dataset not found.")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise MetricError("Metrics only run on PostgreSQL datasets.")
    if not (is_valid_identifier(dataset.schema_name) and is_valid_identifier(dataset.table_name)):
        raise MetricError("Invalid dataset table.")

    joins_by_id: dict[str, DatasetJoin] = {}
    datasets_by_id: dict[str, Dataset] = {}
    for join_id in metric.joins or []:
        join = await db.get(DatasetJoin, join_id)
        if not join:
            raise MetricError(f"Relationship '{join_id}' not found.")
        joins_by_id[join_id] = join
        if dataset.id not in (join.from_dataset_id, join.to_dataset_id):
            raise MetricError(f"Relationship '{join_id}' does not touch this dataset.")
        other_id = (
            join.to_dataset_id if join.from_dataset_id == dataset.id else join.from_dataset_id
        )
        if other_id not in datasets_by_id:
            other = await db.get(Dataset, other_id)
            if not other:
                raise MetricError("Joined dataset not found.")
            datasets_by_id[other_id] = other

    sql, params = build_metric_sql(
        dataset, metric, joins_by_id=joins_by_id, datasets_by_id=datasets_by_id
    )
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(sql), params).mappings().all()
        return [{k: serialize_cell_value(r[k]) for k in r.keys()} for r in rows]
    except MetricError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface DB errors as 400, not 500
        raise MetricError(f"Metric execution failed: {exc}") from exc
    finally:
        engine.dispose()
