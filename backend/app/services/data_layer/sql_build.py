"""Shared SQL builders for the data layer (relationship joins + filters).

Used by both the metric engine and the saved-query engine so the join traversal
and filter semantics stay identical.
"""
from __future__ import annotations

from typing import Any

from app.models.dataset import Dataset
from app.models.dataset_join import DatasetJoin
from app.services.ontology.dataset_tables import is_valid_identifier

_OP_MAP = {"=": "=", "!=": "<>", ">": ">", ">=": ">=", "<": "<", "<=": "<=", "like": "LIKE"}
VALID_OPS = tuple(_OP_MAP) + ("in", "not_in", "is_null", "is_not_null")


class SqlBuildError(ValueError):
    """Raised when a generated query is invalid; wrapped by callers."""


def build_joins_sql(
    base_dataset: Dataset,
    join_ids: list[str],
    *,
    joins_by_id: dict[str, DatasetJoin],
    datasets_by_id: dict[str, Dataset],
) -> list[str]:
    """Build ``<JOIN> "<schema>"."<table>" jN ON …`` clauses for a base dataset."""
    joins_sql: list[str] = []
    for i, join_id in enumerate(join_ids):
        join = joins_by_id.get(join_id)
        if not join:
            raise SqlBuildError(f"Relationship '{join_id}' not found.")
        if join.from_dataset_id == base_dataset.id:
            other_id, base_is_from = join.to_dataset_id, True
        elif join.to_dataset_id == base_dataset.id:
            other_id, base_is_from = join.from_dataset_id, False
        else:
            raise SqlBuildError(f"Relationship '{join_id}' does not touch the base dataset.")
        other = datasets_by_id.get(other_id)
        if not other:
            raise SqlBuildError("Joined dataset not found.")
        if not (is_valid_identifier(other.schema_name) and is_valid_identifier(other.table_name)):
            raise SqlBuildError("Invalid joined table.")
        alias = f"j{i}"
        from_cols = list(join.from_columns or [])
        to_cols = list(join.to_columns or [])
        if len(from_cols) != len(to_cols) or not from_cols:
            raise SqlBuildError("Relationship columns are not aligned.")
        ons: list[str] = []
        for s, t in zip(from_cols, to_cols):
            if not (
                isinstance(s, str)
                and isinstance(t, str)
                and is_valid_identifier(s)
                and is_valid_identifier(t)
            ):
                raise SqlBuildError("Invalid relationship column.")
            ons.append(
                f'base."{s}" = {alias}."{t}"' if base_is_from else f'base."{t}" = {alias}."{s}"'
            )
        join_kind = (join.join_type or "left").upper()
        if join_kind not in ("LEFT", "INNER", "RIGHT", "FULL"):
            join_kind = "LEFT"
        joins_sql.append(
            f'{join_kind} JOIN "{other.schema_name}"."{other.table_name}" {alias} ON '
            + " AND ".join(ons)
        )
    return joins_sql


def build_where(filters: list[dict[str, Any]] | None) -> tuple[list[str], dict[str, Any]]:
    """Build parameterized ``base."col" <op> :param`` conditions."""
    params: dict[str, Any] = {}
    where: list[str] = []
    for i, f in enumerate(filters or []):
        c, op, val = f.get("column"), f.get("op"), f.get("value")
        if not (isinstance(c, str) and is_valid_identifier(c)):
            raise SqlBuildError("Invalid filter column.")
        if op not in VALID_OPS:
            raise SqlBuildError(f"Unsupported operator '{op}'.")
        qcol = f'base."{c}"'
        if op == "is_null":
            where.append(f"{qcol} IS NULL")
        elif op == "is_not_null":
            where.append(f"{qcol} IS NOT NULL")
        elif op in ("in", "not_in"):
            if not isinstance(val, list):
                raise SqlBuildError("IN filter value must be a list.")
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
    return where, params
