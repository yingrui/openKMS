"""Tests for sync connector dataset provision helpers."""

from app.services.connectors.provision import (
    build_create_table_ddl,
    validate_table_columns,
)
from app.services.connectors.tushare.schemas import (
    TUSHARE_DIVIDENDS_COLUMNS,
    TUSHARE_STOCK_BASIC_COLUMNS,
    TUSHARE_TRADE_CALENDAR_COLUMNS,
)


def test_build_create_table_ddl_trade_calendar():
    ddl = build_create_table_ddl("tushare", "trade_calendar", TUSHARE_TRADE_CALENDAR_COLUMNS)
    assert "CREATE SCHEMA IF NOT EXISTS" in ddl
    assert '"trade_calendar"' in ddl
    assert "PRIMARY KEY" in ddl
    assert '"exchange"' in ddl
    assert '"cal_date"' in ddl


def test_validate_table_columns_ok():
    existing = {
        "exchange": "VARCHAR",
        "cal_date": "DATE",
        "is_open": "INTEGER",
        "pretrade_date": "DATE",
    }
    assert validate_table_columns(existing, TUSHARE_TRADE_CALENDAR_COLUMNS) == []


def test_build_create_table_ddl_stock_basic():
    ddl = build_create_table_ddl("tushare", "stock_basic", TUSHARE_STOCK_BASIC_COLUMNS)
    assert '"stock_basic"' in ddl
    assert '"ts_code"' in ddl
    assert "PRIMARY KEY" in ddl


def test_validate_table_columns_missing():
    existing = {"exchange": "TEXT"}
    issues = validate_table_columns(existing, TUSHARE_TRADE_CALENDAR_COLUMNS)
    assert any("cal_date" in i for i in issues)


def test_dividends_base_share_allows_large_万股_values():
    ddl = build_create_table_ddl("tushare", "dividends", TUSHARE_DIVIDENDS_COLUMNS)
    assert '"base_share" NUMERIC(20,4)' in ddl
