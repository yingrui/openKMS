"""Sync Tushare connector outputs into configured PostgreSQL datasets."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.connector import Connector
from app.models.data_source import DataSource
from app.models.dataset import Dataset
from app.services.connector_catalog import decrypt_secrets_blob
from app.services.connector_sync.pg import (
    calendar_range_covered,
    date_to_ymd,
    max_ymd_in_table,
    open_trade_dates_from_table,
    pg_engine_for_datasource,
    upsert_rows,
    ymd_to_date,
)
from app.services.connector_sync.sync_range import SyncDateRange, parse_sync_date_range
from app.services.connector_sync.tushare.client import TushareClient
from app.services.connector_sync.tushare.schemas import (
    TUSHARE_STOCK_TRADE_DAILY_COLUMNS,
    TUSHARE_TRADE_CALENDAR_COLUMNS,
)

logger = logging.getLogger(__name__)

# A-share SSE/SZSE share the same trading calendar; one trade_cal call avoids hourly limits.
_CALENDAR_EXCHANGE = "SSE"
_DEFAULT_SYNC_START_YMD = "19900101"
_DEFAULT_API_MIN_INTERVAL_SECONDS = 61
_DEFAULT_TRADE_CAL_MIN_INTERVAL_SECONDS = 3661
_MAX_API_MIN_INTERVAL_SECONDS = 7200


def _sync_settings(settings: dict[str, Any] | None) -> dict[str, Any]:
    raw = settings or {}
    start_raw = raw.get("sync_start_date", _DEFAULT_SYNC_START_YMD)
    start = ymd_to_date(str(start_raw))
    if not start:
        raise ValueError(
            "Invalid sync_start_date in connector settings; use YYYYMMDD (e.g. 19900101)."
        )
    try:
        interval = float(raw.get("sync_api_min_interval_seconds", _DEFAULT_API_MIN_INTERVAL_SECONDS))
    except (TypeError, ValueError):
        interval = float(_DEFAULT_API_MIN_INTERVAL_SECONDS)
    interval = max(1.0, min(interval, float(_MAX_API_MIN_INTERVAL_SECONDS)))
    try:
        trade_cal_interval = float(
            raw.get("sync_trade_cal_min_interval_seconds", _DEFAULT_TRADE_CAL_MIN_INTERVAL_SECONDS)
        )
    except (TypeError, ValueError):
        trade_cal_interval = float(_DEFAULT_TRADE_CAL_MIN_INTERVAL_SECONDS)
    trade_cal_interval = max(1.0, min(trade_cal_interval, float(_MAX_API_MIN_INTERVAL_SECONDS)))
    return {
        "sync_start_date": start,
        "api_min_interval_seconds": interval,
        "trade_cal_min_interval_seconds": trade_cal_interval,
    }


def _today_utc() -> date:
    return datetime.now(timezone.utc).date()


def _default_calendar_window(
    engine: Engine,
    *,
    schema_name: str,
    table_name: str,
    sync_start_date: date,
    today: date,
) -> tuple[date, date]:
    """Incremental calendar sync from last stored cal_date (or settings fallback)."""
    latest = max_ymd_in_table(
        engine, schema_name=schema_name, table_name=table_name, column="cal_date"
    )
    start = ymd_to_date(latest) if latest else sync_start_date
    start = start or sync_start_date
    end = date(today.year + 1, 12, 31)
    if start > end:
        return end, end
    return start, end


def _default_daily_window(
    engine: Engine,
    *,
    schema_name: str,
    table_name: str,
    sync_start_date: date,
    today: date,
) -> tuple[date, date]:
    """Incremental daily sync from last stored trade_date (or settings fallback) through today."""
    latest = max_ymd_in_table(
        engine, schema_name=schema_name, table_name=table_name, column="trade_date"
    )
    start = ymd_to_date(latest) if latest else sync_start_date
    start = start or sync_start_date
    if start > today:
        return today, today
    return start, today


def _resolve_tushare_windows(
    requested: SyncDateRange,
    *,
    calendar_engine: Engine,
    calendar_schema: str,
    calendar_table: str,
    daily_engine: Engine,
    daily_schema: str,
    daily_table: str,
    sync_start_date: date,
    today: date,
) -> tuple[tuple[date, date], tuple[date, date]]:
    if requested.is_explicit:
        assert requested.start is not None and requested.end is not None
        window = (requested.start, requested.end)
        return window, window
    cal = _default_calendar_window(
        calendar_engine,
        schema_name=calendar_schema,
        table_name=calendar_table,
        sync_start_date=sync_start_date,
        today=today,
    )
    daily = _default_daily_window(
        daily_engine,
        schema_name=daily_schema,
        table_name=daily_table,
        sync_start_date=sync_start_date,
        today=today,
    )
    return cal, daily


async def _load_output_dataset(
    db: AsyncSession, outputs: dict[str, str] | None, slot: str
) -> tuple[Dataset, DataSource]:
    if not outputs or slot not in outputs:
        raise ValueError(f"Connector output slot '{slot}' is not configured.")
    dataset = await db.get(Dataset, outputs[slot])
    if not dataset:
        raise ValueError(f"Dataset not found for slot '{slot}'.")
    ds = await db.get(DataSource, dataset.data_source_id)
    if not ds or ds.kind != "postgresql":
        raise ValueError(f"Dataset for slot '{slot}' is not on PostgreSQL.")
    return dataset, ds


async def _open_trade_dates_from_api(
    client: TushareClient,
    *,
    start: date,
    end: date,
) -> list[str]:
    """Fallback: fetch open dates from Tushare (rate-limited; prefer DB calendar)."""
    fetched = await client.query(
        "trade_cal",
        {
            "exchange": _CALENDAR_EXCHANGE,
            "start_date": date_to_ymd(start),
            "end_date": date_to_ymd(end),
        },
        "cal_date,is_open",
    )
    open_dates: set[str] = set()
    for row in fetched:
        if str(row.get("is_open")) in ("1", "1.0"):
            cal = row.get("cal_date")
            if cal:
                open_dates.add(str(cal))
    return sorted(open_dates)


async def sync_trade_calendar(
    client: TushareClient,
    db: AsyncSession,
    connector: Connector,
    *,
    start: date,
    end: date,
    engine: Engine | None = None,
) -> int:
    dataset, data_source = await _load_output_dataset(db, connector.outputs, "trade_calendar")
    own_engine = engine is None
    if own_engine:
        engine = pg_engine_for_datasource(data_source)
    written = 0
    start_s, end_s = date_to_ymd(start), date_to_ymd(end)
    try:
        if start > end:
            logger.info("trade_calendar already up to date for connector %s", connector.id)
            return 0

        logger.info(
            "trade_calendar sync window for %s: %s → %s",
            connector.id,
            start_s,
            end_s,
        )

        if calendar_range_covered(
            engine,
            schema_name=dataset.schema_name,
            table_name=dataset.table_name,
            exchange=_CALENDAR_EXCHANGE,
            start=start,
            end=end,
        ):
            logger.info(
                "trade_calendar already covers %s → %s for %s; skipping Tushare API",
                start_s,
                end_s,
                connector.id,
            )
            return 0

        fetched = await client.query(
            "trade_cal",
            {
                "exchange": _CALENDAR_EXCHANGE,
                "start_date": start_s,
                "end_date": end_s,
            },
            "exchange,cal_date,is_open,pretrade_date",
        )
        rows = [
            {
                "exchange": row.get("exchange") or _CALENDAR_EXCHANGE,
                "cal_date": row.get("cal_date"),
                "is_open": row.get("is_open"),
                "pretrade_date": row.get("pretrade_date"),
            }
            for row in fetched
        ]
        logger.info(
            "trade_calendar fetched %s rows; writing to %s.%s",
            len(rows),
            dataset.schema_name,
            dataset.table_name,
        )
        written += upsert_rows(
            engine,
            schema_name=dataset.schema_name,
            table_name=dataset.table_name,
            columns=TUSHARE_TRADE_CALENDAR_COLUMNS,
            rows=rows,
        )
    finally:
        if own_engine and engine is not None:
            engine.dispose()
    logger.info(
        "Synced trade_calendar for connector %s: %s rows into %s.%s",
        connector.id,
        written,
        dataset.schema_name,
        dataset.table_name,
    )
    return written


async def sync_stock_trade_daily(
    client: TushareClient,
    db: AsyncSession,
    connector: Connector,
    *,
    start: date,
    end: date,
    calendar_dataset: Dataset,
    calendar_engine: Engine,
) -> int:
    dataset, data_source = await _load_output_dataset(db, connector.outputs, "stock_trade_daily")
    engine = pg_engine_for_datasource(data_source)
    trade_dates: list[str] = []
    written = 0
    try:
        trade_dates = open_trade_dates_from_table(
            calendar_engine,
            schema_name=calendar_dataset.schema_name,
            table_name=calendar_dataset.table_name,
            start=start,
            end=end,
        )
        if not trade_dates:
            logger.warning(
                "trade_calendar table has no open dates in range; falling back to Tushare trade_cal API"
            )
            trade_dates = await _open_trade_dates_from_api(client, start=start, end=end)
        if not trade_dates:
            logger.info(
                "stock_trade_daily: no open trade dates for connector %s in %s → %s",
                connector.id,
                date_to_ymd(start),
                date_to_ymd(end),
            )
            return 0

        logger.info(
            "stock_trade_daily sync window for %s: %s → %s (%s trade dates)",
            connector.id,
            trade_dates[0],
            trade_dates[-1],
            len(trade_dates),
        )

        daily_fields = (
            "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
        )
        adj_fields = "ts_code,trade_date,adj_factor"

        for trade_date in trade_dates:
            daily_rows = await client.query("daily", {"trade_date": trade_date}, daily_fields)
            adj_rows = await client.query("adj_factor", {"trade_date": trade_date}, adj_fields)
            adj_by_key = {
                (str(r.get("ts_code")), str(r.get("trade_date"))): r.get("adj_factor")
                for r in adj_rows
            }
            day_rows = []
            for row in daily_rows:
                key = (str(row.get("ts_code")), str(row.get("trade_date")))
                day_rows.append(
                    {
                        "ts_code": row.get("ts_code"),
                        "trade_date": row.get("trade_date"),
                        "open": row.get("open"),
                        "high": row.get("high"),
                        "low": row.get("low"),
                        "close": row.get("close"),
                        "pre_close": row.get("pre_close"),
                        "change": row.get("change"),
                        "pct_chg": row.get("pct_chg"),
                        "vol": row.get("vol"),
                        "amount": row.get("amount"),
                        "adj_factor": adj_by_key.get(key),
                    }
                )
            if day_rows:
                logger.info(
                    "stock_trade_daily %s: %s rows -> %s.%s",
                    trade_date,
                    len(day_rows),
                    dataset.schema_name,
                    dataset.table_name,
                )
                written += upsert_rows(
                    engine,
                    schema_name=dataset.schema_name,
                    table_name=dataset.table_name,
                    columns=TUSHARE_STOCK_TRADE_DAILY_COLUMNS,
                    rows=day_rows,
                )
    finally:
        engine.dispose()
    logger.info(
        "Synced stock_trade_daily for connector %s: %s rows (%s trade dates) into %s.%s",
        connector.id,
        written,
        len(trade_dates),
        dataset.schema_name,
        dataset.table_name,
    )
    return written


async def sync_tushare_connector(
    db: AsyncSession,
    connector: Connector,
    *,
    start_date: date | str | None = None,
    end_date: date | str | None = None,
) -> dict[str, int]:
    requested = parse_sync_date_range(start_date, end_date)
    today = _today_utc()
    secrets = decrypt_secrets_blob(connector.secrets_encrypted)
    token = secrets.get("TUSHARE_TOKEN", "")
    inputs = connector.inputs or {}
    base_url = str(inputs.get("api_base_url") or "https://api.tushare.pro")
    cfg = _sync_settings(connector.settings)
    client = TushareClient(
        token=token,
        base_url=base_url,
        min_interval_seconds=cfg["api_min_interval_seconds"],
        api_min_interval_seconds={
            "trade_cal": cfg["trade_cal_min_interval_seconds"],
        },
    )

    calendar_dataset, calendar_ds = await _load_output_dataset(db, connector.outputs, "trade_calendar")
    daily_dataset, daily_ds = await _load_output_dataset(db, connector.outputs, "stock_trade_daily")
    calendar_engine = pg_engine_for_datasource(calendar_ds)
    daily_engine = pg_engine_for_datasource(daily_ds)
    try:
        (cal_start, cal_end), (daily_start, daily_end) = _resolve_tushare_windows(
            requested,
            calendar_engine=calendar_engine,
            calendar_schema=calendar_dataset.schema_name,
            calendar_table=calendar_dataset.table_name,
            daily_engine=daily_engine,
            daily_schema=daily_dataset.schema_name,
            daily_table=daily_dataset.table_name,
            sync_start_date=cfg["sync_start_date"],
            today=today,
        )
        if requested.is_explicit:
            logger.info(
                "Tushare sync for %s using requested window %s → %s",
                connector.id,
                date_to_ymd(cal_start),
                date_to_ymd(cal_end),
            )
        else:
            logger.info(
                "Tushare sync for %s using default windows: calendar %s → %s, daily %s → %s",
                connector.id,
                date_to_ymd(cal_start),
                date_to_ymd(cal_end),
                date_to_ymd(daily_start),
                date_to_ymd(daily_end),
            )

        calendar_rows = await sync_trade_calendar(
            client,
            db,
            connector,
            start=cal_start,
            end=cal_end,
            engine=calendar_engine,
        )
        daily_rows = await sync_stock_trade_daily(
            client,
            db,
            connector,
            start=daily_start,
            end=daily_end,
            calendar_dataset=calendar_dataset,
            calendar_engine=calendar_engine,
        )
    finally:
        calendar_engine.dispose()
        daily_engine.dispose()

    return {
        "trade_calendar": calendar_rows,
        "stock_trade_daily": daily_rows,
    }
