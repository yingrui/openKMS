"""Apply row edits (insert / update / delete) to a dataset's backing PostgreSQL table.

Safety model:

* **Opt-in** — the dataset must have ``is_editable``.
* **Primary key required** for update/delete (else rows cannot be targeted).
* Every identifier is validated; every value is **parameterized**.
* **Optimistic concurrency** via ``expect`` (old values appended to the WHERE clause):
  a concurrent change makes ``rowcount == 0`` → rejected.
* Each applied op is written to the ``dataset_edits`` audit table.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.dataset_edit import DatasetEdit
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource


class RowEditError(ValueError):
    """Raised when a row edit cannot be applied; surfaced as HTTP 400."""


def _quote_table(dataset: Dataset) -> str:
    if not (is_valid_identifier(dataset.schema_name) and is_valid_identifier(dataset.table_name)):
        raise RowEditError("Invalid dataset table.")
    return f'"{dataset.schema_name}"."{dataset.table_name}"'


def _pk_columns(dataset: Dataset) -> list[str]:
    cols = [str(c) for c in (dataset.primary_key_columns or [])]
    for c in cols:
        if not is_valid_identifier(c):
            raise RowEditError(f"Invalid primary-key column '{c}'.")
    return cols


def _predicate(mapping: dict[str, Any], params: dict[str, Any], prefix: str) -> str:
    clauses: list[str] = []
    for i, (col, val) in enumerate(mapping.items()):
        if not is_valid_identifier(str(col)):
            raise RowEditError(f"Invalid column '{col}'.")
        if val is None:
            clauses.append(f'"{col}" IS NULL')
        else:
            key = f"{prefix}{i}"
            clauses.append(f'"{col}" = :{key}')
            params[key] = val
    if not clauses:
        raise RowEditError("Empty predicate.")
    return " AND ".join(clauses)


def _assignments(mapping: dict[str, Any], params: dict[str, Any]) -> str:
    if not mapping:
        raise RowEditError("No values to write.")
    sets: list[str] = []
    for i, (col, val) in enumerate(mapping.items()):
        if not is_valid_identifier(str(col)):
            raise RowEditError(f"Invalid column '{col}'.")
        key = f"s{i}"
        sets.append(f'"{col}" = :{key}')
        params[key] = val
    return ", ".join(sets)


def _columns(values: dict[str, Any], params: dict[str, Any]) -> tuple[str, str]:
    if not values:
        raise RowEditError("Insert needs values.")
    cols: list[str] = []
    keys: list[str] = []
    for i, (col, val) in enumerate(values.items()):
        if not is_valid_identifier(str(col)):
            raise RowEditError(f"Invalid column '{col}'.")
        cols.append(f'"{col}"')
        keys.append(f":v{i}")
        params[f"v{i}"] = val
    return ", ".join(cols), ", ".join(keys)


async def apply_row_ops(
    db: AsyncSession,
    dataset: Dataset,
    ops: list[dict[str, Any]],
    *,
    dry_run: bool = False,
    actor: str | None = None,
    actor_name: str | None = None,
) -> dict[str, int]:
    if not dataset.is_editable:
        raise RowEditError("This dataset is not editable. Enable editing in its settings.")
    pk_cols = _pk_columns(dataset)
    needs_pk = any(str(o.get("op") or "").lower() in ("update", "delete") for o in ops)
    if needs_pk and not pk_cols:
        raise RowEditError("Update/delete require a primary key on the dataset.")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise RowEditError("Row editing is only supported for PostgreSQL datasets.")
    table = _quote_table(dataset)

    applied: list[dict[str, Any]] = []
    inserted = updated = deleted = 0
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.begin() as conn:
            for raw in ops:
                kind = str(raw.get("op") or "").lower()
                params: dict[str, Any] = {}
                if kind == "insert":
                    cols_sql, ph_sql = _columns(raw.get("values") or {}, params)
                    sql = f"INSERT INTO {table} ({cols_sql}) VALUES ({ph_sql})"
                    if not dry_run:
                        conn.execute(text(sql), params)
                    inserted += 1
                elif kind in ("update", "delete"):
                    if not pk_cols:
                        raise RowEditError("Update/delete require a primary key on the dataset.")
                    pk = raw.get("pk") or {}
                    missing = [c for c in pk_cols if c not in pk]
                    if missing:
                        raise RowEditError(f"Missing primary-key values: {', '.join(missing)}")
                    where = _predicate(pk, params, "pk")
                    expect = raw.get("expect") or {}
                    if expect:
                        where += " AND " + _predicate(expect, params, "ex")
                    if kind == "update":
                        sql = f"UPDATE {table} SET {_assignments(raw.get('values') or {}, params)} WHERE {where}"
                    else:
                        sql = f"DELETE FROM {table} WHERE {where}"
                    if not dry_run:
                        result = conn.execute(text(sql), params)
                        if result.rowcount == 0:
                            raise RowEditError(
                                "No row matched (row missing or changed by someone else) — refresh and retry."
                            )
                    if kind == "update":
                        updated += 1
                    else:
                        deleted += 1
                else:
                    raise RowEditError(f"Unknown op '{kind}'.")
                applied.append(raw)
            if not dry_run:
                for raw in applied:
                    db.add(
                        DatasetEdit(
                            id=str(uuid.uuid4()),
                            dataset_id=dataset.id,
                            op=str(raw.get("op")).lower(),
                            pk=raw.get("pk"),
                            before=raw.get("expect"),
                            after=raw.get("values"),
                            actor=actor,
                            actor_name=actor_name,
                        )
                    )
    except RowEditError:
        raise
    except Exception as exc:  # surface DB errors as 400, not 500
        raise RowEditError(f"Edit failed: {exc}") from exc
    finally:
        engine.dispose()
    return {"inserted": inserted, "updated": updated, "deleted": deleted}
