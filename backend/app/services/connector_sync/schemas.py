"""Dataset column contracts for sync connector output slots."""

from __future__ import annotations

from dataclasses import dataclass

TUSHARE_PG_SCHEMA = "tushare"


@dataclass(frozen=True, slots=True)
class ConnectorDatasetColumn:
    name: str
    pg_type: str
    nullable: bool = False
    primary_key: bool = False


TUSHARE_TRADE_CALENDAR_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("exchange", "TEXT", primary_key=True),
    ConnectorDatasetColumn("cal_date", "TEXT", primary_key=True),
    ConnectorDatasetColumn("is_open", "SMALLINT"),
    ConnectorDatasetColumn("pretrade_date", "TEXT", nullable=True),
)

TUSHARE_STOCK_TRADE_DAILY_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("ts_code", "TEXT", primary_key=True),
    ConnectorDatasetColumn("trade_date", "TEXT", primary_key=True),
    ConnectorDatasetColumn("open", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("high", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("low", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("close", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pre_close", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("change", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pct_chg", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("vol", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("amount", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("adj_factor", "NUMERIC", nullable=True),
)
