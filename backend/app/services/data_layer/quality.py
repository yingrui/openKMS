"""Run quality rules against a dataset's PostgreSQL table.

Five rule types are **declarative** (`not_null` / `unique` / `range` / `referential` / `freshness`) —
parameters live in `config`, and they cover the standard checks without anyone writing SQL.

The sixth, `sql`, is for the constraints that are actually business-specific ("the high price can never
be below the low", "the share of null P/E is under 30%"): the rule carries a read-only query whose
single number is the **count of violating rows** — `> 0` fails. That is the same contract dbt tests and
Soda use, and the safest one to hold: a pass/fail question has one shape.

The query must reference `{{table}}` (the dataset's qualified table) so it cannot silently be a rule
about some other table, and it runs through `run_readonly`: a read-only transaction with a statement
timeout. The credential is the privilege boundary, as everywhere in the data layer — someone who can
write a rule could already query the same source in the Playground.
"""
from __future__ import annotations

import datetime as _dt
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.models.quality_rule import QualityRule
from app.services.data_layer.sql_runner import run_readonly_scalar
from app.services.ontology.dataset_tables import is_valid_identifier, pg_engine_for_datasource

RULE_TYPES = ("not_null", "unique", "range", "referential", "freshness", "sql")

#: Longer than this is not a rule, it is a script — and it would be stored in `config` and rendered
#: in a form.
MAX_RULE_SQL = 4000
#: A rule that takes longer than this is not a rule either (the runner also bounds the statement).
RULE_SQL_TIMEOUT_MS = 20_000


class QualityError(ValueError):
    """Raised when a rule cannot run; surfaced as HTTP 400."""


def normalize_rule_sql(sql: str) -> str:
    """Check the shape of a `sql` rule and return the statement to run.

    Deliberately a shape check, not a parser: the guarantee that nothing is written comes from the
    read-only transaction, and this exists so the mistake (a `DELETE`, a second statement) is a clear
    message instead of a database error.
    """
    body = (sql or "").strip().rstrip(";").strip()
    if not body:
        raise QualityError("A SQL rule needs a query.")
    if len(body) > MAX_RULE_SQL:
        raise QualityError(f"A SQL rule must be under {MAX_RULE_SQL} characters.")
    if ";" in body:
        raise QualityError("A SQL rule must be a single statement.")
    head = body.lstrip("(").split(None, 1)[0].lower() if body.strip() else ""
    if head not in ("select", "with"):
        raise QualityError("A SQL rule must be a SELECT (or a WITH … SELECT).")
    if "{{table}}" not in body:
        raise QualityError("A SQL rule must read {{table}}, so it is a rule about this dataset.")
    return body


def render_rule_sql(body: str, table: str, col: str | None) -> str:
    """Fill the placeholders. `table` arrives already quoted and validated."""
    rendered = body.replace("{{table}}", table)
    if col and is_valid_identifier(col):
        rendered = rendered.replace("{{column}}", f'"{col}"')
    else:
        rendered = rendered.replace("{{column}}", "NULL")
    return rendered


def verdict_from_sql(column_count: int, first_row: list[Any]) -> int:
    """The count of violating rows from a rule query — the one shape such a query may return.

    Takes the **column count** separately from the values: a dict of the result collapses duplicate
    column names, so ``SELECT count(*), count(*)`` would otherwise look like a single column (it did,
    once). Pure, so the contract is testable without a database.
    """
    if column_count != 1 or len(first_row) != 1:
        raise QualityError(
            "A SQL rule must return exactly one row with one number: the count of violating rows."
        )
    value = first_row[0]
    if value is None or isinstance(value, bool):
        raise QualityError("A SQL rule's number cannot be null or a boolean.")
    try:
        return int(float(value))
    except (TypeError, ValueError) as exc:
        raise QualityError("A SQL rule must return a number (the count of violating rows).") from exc


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
    if rule.rule_type not in ("freshness", "sql") and not (col and is_valid_identifier(col)):
        raise QualityError("A valid column is required.")
    table = _quote_table(dataset)

    if rule.rule_type == "sql":
        try:
            body = normalize_rule_sql(str(cfg.get("sql") or ""))
            rendered = render_rule_sql(body, table, col)
            columns, row = run_readonly_scalar(ds, rendered, timeout_ms=RULE_SQL_TIMEOUT_MS)
            failed = verdict_from_sql(columns, row)
        except QualityError:
            raise
        except Exception as exc:
            # Same contract as the declarative branch: a database error is a bad rule (400) and is
            # recorded as `error`, not an unhandled 500 with a traceback that quotes the SQL.
            raise QualityError(f"Rule execution failed: {exc}") from exc
        return {
            "status": "failed" if failed else "passed",
            # The count of rows is not knowable from an arbitrary query; saying 0 would be a lie.
            "checked_count": None,
            "failed_count": failed,
            "detail": {"sql": rendered},
        }

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
                # Nulls are not duplicates: SQL's UNIQUE allows many of them, and the range rule above
                # already reads "checked" as the non-null rows. Counting them here (as this did) made
                # every nullable column fail with a number that was mostly missing data.
                row = conn.execute(
                    text(
                        f'SELECT COUNT(*) FILTER (WHERE "{col}" IS NOT NULL) AS checked, '
                        f'COUNT(*) FILTER (WHERE "{col}" IS NOT NULL) - COUNT(DISTINCT "{col}") '
                        f"AS failed FROM {table}"
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
    except QualityError:
        raise
    except Exception as exc:  # surface DB errors as 400, not 500
        raise QualityError(f"Rule execution failed: {exc}") from exc
    finally:
        engine.dispose()
