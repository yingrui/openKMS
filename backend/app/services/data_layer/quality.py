"""Run declarative quality rules against a dataset's PostgreSQL table.

Rule types are fixed (`not_null` / `unique` / `range` / `referential` / `freshness`);
parameters live in `config`. Never executes arbitrary SQL.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.quality_rule import QualityRule
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource

RULE_TYPES = ("not_null", "unique", "range", "referential", "freshness")


class QualityError(ValueError):
    """Raised when a rule cannot run; surfaced as HTTP 400."""


def _quote_table(dataset: Dataset) -> str:
    if not (is_valid_identifier(dataset.schema_name) and is_valid_identifier(dataset.table_name)):
        raise QualityError("Invalid dataset table.")
    return f'"{dataset.schema_name}"."{dataset.table_name}"'


async def run_rule(db: AsyncSession, dataset: Dataset, rule: QualityRule) -> dict[str, Any]:
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise QualityError("Quality rules are only supported for PostgreSQL datasets.")
    cfg = rule.config or {}
    col = rule.column_name
    if rule.rule_type != "freshness" and not (col and is_valid_identifier(col)):
        raise QualityError("A valid column is required.")
    table = _quote_table(dataset)
    engine = pg_engine_for_datasource(ds)
    try:
        with engine.connect() as conn:
            if rule.rule_type == "not_null":
                row = conn.execute(
                    text(
                        f'SELECT COUNT(*) AS checked, '
                        f'COUNT(*) FILTER (WHERE "{col}" IS NULL) AS failed FROM {table}'
                    )
                ).mappings().first()
            elif rule.rule_type == "unique":
                row = conn.execute(
                    text(
                        f'SELECT COUNT(*) AS checked, '
                        f'COUNT(*) - COUNT(DISTINCT "{col}") AS failed FROM {table}'
                    )
                ).mappings().first()
            elif rule.rule_type == "range":
                lo, hi = cfg.get("min"), cfg.get("max")
                conds: list[str] = []
                params: dict[str, Any] = {}
                if lo is not None:
                    conds.append(f'"{col}" < :lo')
                    params["lo"] = lo
                if hi is not None:
                    conds.append(f'"{col}" > :hi')
                    params["hi"] = hi
                cond = " OR ".join(conds) if conds else "false"
                row = conn.execute(
                    text(
                        f'SELECT COUNT(*) FILTER (WHERE "{col}" IS NOT NULL) AS checked, '
                        f'COUNT(*) FILTER (WHERE "{col}" IS NOT NULL AND ({cond})) AS failed '
                        f"FROM {table}"
                    ),
                    params,
                ).mappings().first()
            elif rule.rule_type == "referential":
                ref_id, ref_col = cfg.get("ref_dataset_id"), cfg.get("ref_column")
                ref = await db.get(Dataset, ref_id) if ref_id else None
                if not ref or not (isinstance(ref_col, str) and is_valid_identifier(ref_col)):
                    raise QualityError("Referential rule needs a reference dataset and column.")
                ref_table = _quote_table(ref)
                row = conn.execute(
                    text(
                        f'SELECT COUNT(*) FILTER (WHERE "{col}" IS NOT NULL) AS checked, '
                        f'COUNT(*) FILTER (WHERE "{col}" IS NOT NULL AND "{col}" NOT IN '
                        f'(SELECT "{ref_col}" FROM {ref_table})) AS failed FROM {table}'
                    )
                ).mappings().first()
            elif rule.rule_type == "freshness":
                if not (col and is_valid_identifier(col)):
                    raise QualityError("Freshness needs a date/timestamp column.")
                max_age = int(cfg.get("max_age_days") or 1)
                row = conn.execute(text(f'SELECT MAX("{col}") AS latest FROM {table}')).mappings().first()
                latest = (row or {}).get("latest")
                if latest is None:
                    failed = 1
                elif isinstance(latest, _dt.datetime):
                    latest_dt = latest if latest.tzinfo else latest.replace(tzinfo=_dt.timezone.utc)
                    failed = 1 if (_dt.datetime.now(_dt.timezone.utc) - latest_dt).days > max_age else 0
                else:
                    failed = 1 if (_dt.date.today() - latest).days > max_age else 0
                return {
                    "status": "failed" if failed else "passed",
                    "checked_count": 1,
                    "failed_count": failed,
                    "detail": {"latest": str(latest), "max_age_days": max_age},
                }
            else:
                raise QualityError(f"Unknown rule type '{rule.rule_type}'.")

        checked = int((row or {}).get("checked") or 0)
        failed = int((row or {}).get("failed") or 0)
        return {
            "status": "failed" if failed else "passed",
            "checked_count": checked,
            "failed_count": failed,
            "detail": {},
        }
    finally:
        engine.dispose()
