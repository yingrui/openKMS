"""PostgreSQL helpers for connector sync writers."""

from __future__ import annotations

import re
from datetime import date, datetime
from urllib.parse import quote_plus

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from app.models.data_source import DataSource
from app.services.connector_sync.schemas import ConnectorDatasetColumn
from app.services.credential_encryption import decrypt

_IDENTIFIER = re.compile(r"^[a-zA-Z0-9_]+$")


def pg_engine_for_datasource(ds: DataSource) -> Engine:
    username = decrypt(ds.username_encrypted) if ds.username_encrypted else ""
    password = decrypt(ds.password_encrypted) if ds.password_encrypted else ""
    password_escaped = quote_plus(password) if password else ""
    url = (
        f"postgresql://{username}:{password_escaped}@{ds.host}:{ds.port or 5432}"
        f"/{ds.database or 'postgres'}"
    )
    return create_engine(url, pool_pre_ping=True, pool_recycle=10)


def ymd_to_date(value: str | date | datetime | None) -> date | None:
    """Parse YYYYMMDD (or ISO date) to ``date``."""
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    s = str(value).strip().replace("-", "")[:8]
    if len(s) != 8 or not s.isdigit():
        return None
    return date(int(s[:4]), int(s[4:6]), int(s[6:8]))


def date_to_ymd(value: date) -> str:
    return value.strftime("%Y%m%d")


def max_ymd_in_table(
    engine: Engine,
    *,
    schema_name: str,
    table_name: str,
    column: str,
) -> str | None:
    """Return MAX(date column) as YYYYMMDD, or None when the table is empty."""
    if not _IDENTIFIER.match(column):
        raise ValueError(f"Invalid column name: {column}")
    table_q = f"{quote_ident(schema_name)}.{quote_ident(table_name)}"
    col_q = quote_ident(column)
    with engine.connect() as conn:
        val = conn.execute(text(f"SELECT MAX({col_q}) FROM {table_q}")).scalar()
    if val is None:
        return None
    parsed = ymd_to_date(val)
    return date_to_ymd(parsed) if parsed else None


def open_trade_dates_from_table(
    engine: Engine,
    *,
    schema_name: str,
    table_name: str,
    start: date,
    end: date,
) -> list[str]:
    """Distinct open trading dates (YYYYMMDD) from a synced trade_calendar table."""
    table_q = f"{quote_ident(schema_name)}.{quote_ident(table_name)}"
    start_s, end_s = date_to_ymd(start), date_to_ymd(end)
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                f"""
                SELECT DISTINCT cal_date
                FROM {table_q}
                WHERE is_open = 1
                  AND cal_date >= :start_date
                  AND cal_date <= :end_date
                ORDER BY cal_date
                """
            ),
            {"start_date": start_s, "end_date": end_s},
        ).fetchall()
    return [str(r[0]) for r in rows if r[0] is not None]


def quote_ident(name: str) -> str:
    if not _IDENTIFIER.match(name):
        raise ValueError(f"Invalid SQL identifier: {name}")
    return '"' + name.replace('"', '""') + '"'


def upsert_rows(
    engine: Engine,
    *,
    schema_name: str,
    table_name: str,
    columns: tuple[ConnectorDatasetColumn, ...],
    rows: list[dict],
    chunk_size: int = 500,
) -> int:
    """Insert or update rows using the slot primary key (commits per chunk)."""
    if not rows:
        return 0
    pk_cols = [c.name for c in columns if c.primary_key]
    if not pk_cols:
        raise ValueError("Upsert requires at least one primary-key column.")

    col_names = [c.name for c in columns]
    table_q = f"{quote_ident(schema_name)}.{quote_ident(table_name)}"
    cols_sql = ", ".join(quote_ident(n) for n in col_names)
    values_sql = ", ".join(f":{n}" for n in col_names)
    update_cols = [n for n in col_names if n not in pk_cols]
    conflict_sql = ", ".join(quote_ident(n) for n in pk_cols)
    if update_cols:
        set_sql = ", ".join(f"{quote_ident(n)} = EXCLUDED.{quote_ident(n)}" for n in update_cols)
        on_conflict = f"ON CONFLICT ({conflict_sql}) DO UPDATE SET {set_sql}"
    else:
        on_conflict = f"ON CONFLICT ({conflict_sql}) DO NOTHING"

    sql = text(
        f"INSERT INTO {table_q} ({cols_sql}) VALUES ({values_sql}) {on_conflict}"
    )
    written = 0
    step = max(1, int(chunk_size))
    for offset in range(0, len(rows), step):
        chunk = rows[offset : offset + step]
        with engine.begin() as conn:
            for row in chunk:
                params = {name: _coerce_row_value(row.get(name)) for name in col_names}
                conn.execute(sql, params)
                written += 1
    return written


def _coerce_row_value(value):
    if value is None or value == "":
        return None
    return value
