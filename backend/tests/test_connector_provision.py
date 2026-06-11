"""Tests for sync connector dataset provision helpers."""

from app.services.connector_sync.provision import (
    build_create_table_ddl,
    validate_table_columns,
)
from app.services.connector_sync.tushare.schemas import (
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
        "exchange": "TEXT",
        "cal_date": "TEXT",
        "is_open": "SMALLINT",
        "pretrade_date": "TEXT",
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
