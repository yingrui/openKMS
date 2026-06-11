"""Tushare dataset column contracts."""

from __future__ import annotations

from app.services.connector_sync.schemas import ConnectorDatasetColumn

TUSHARE_PG_SCHEMA = "tushare"

TUSHARE_TRADE_CALENDAR_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("exchange", "TEXT", primary_key=True),
    ConnectorDatasetColumn("cal_date", "TEXT", primary_key=True),
    ConnectorDatasetColumn("is_open", "SMALLINT"),
    ConnectorDatasetColumn("pretrade_date", "TEXT", nullable=True),
)

TUSHARE_STOCK_BASIC_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("ts_code", "TEXT", primary_key=True),
    ConnectorDatasetColumn("symbol", "TEXT", nullable=True),
    ConnectorDatasetColumn("name", "TEXT", nullable=True),
    ConnectorDatasetColumn("area", "TEXT", nullable=True),
    ConnectorDatasetColumn("industry", "TEXT", nullable=True),
    ConnectorDatasetColumn("fullname", "TEXT", nullable=True),
    ConnectorDatasetColumn("enname", "TEXT", nullable=True),
    ConnectorDatasetColumn("cnspell", "TEXT", nullable=True),
    ConnectorDatasetColumn("market", "TEXT", nullable=True),
    ConnectorDatasetColumn("exchange", "TEXT", nullable=True),
    ConnectorDatasetColumn("curr_type", "TEXT", nullable=True),
    ConnectorDatasetColumn("list_status", "TEXT", nullable=True),
    ConnectorDatasetColumn("list_date", "TEXT", nullable=True),
    ConnectorDatasetColumn("delist_date", "TEXT", nullable=True),
    ConnectorDatasetColumn("is_hs", "TEXT", nullable=True),
    ConnectorDatasetColumn("act_name", "TEXT", nullable=True),
    ConnectorDatasetColumn("act_ent_type", "TEXT", nullable=True),
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
