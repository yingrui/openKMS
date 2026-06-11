"""Unit tests for Tushare sync helpers."""

import asyncio
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.connector_sync.pg import date_to_ymd, ymd_to_date
from app.services.connector_sync.sync_range import SyncDateRange
from app.services.connector_sync.tushare.client import (
    DEFER_RETRY_AFTER_SECONDS,
    TushareClient,
    TushareRateLimitError,
    is_tushare_rate_limit_error,
    parse_tushare_rate_limit_wait_seconds,
)
from app.services.connector_sync.tushare.sync import (
    _resolve_tushare_windows,
    _sync_settings,
    sync_stock_basic,
)

_START = date(1990, 1, 1)
_TODAY = date(2026, 6, 10)


def test_sync_settings_defaults():
    cfg = _sync_settings(None)
    assert cfg["sync_start_date"] == _START
    assert cfg["api_min_interval_seconds"] == 0.31
    assert cfg["trade_cal_min_interval_seconds"] == 0.31


def test_resolve_explicit_uses_same_window_for_both_slots():
    class _Engine:
        pass

    requested = SyncDateRange(date(2025, 1, 1), date(2025, 12, 31))
    cal, daily = _resolve_tushare_windows(
        requested,
        calendar_engine=_Engine(),
        calendar_schema="tushare",
        calendar_table="trade_calendar",
        daily_engine=_Engine(),
        daily_schema="tushare",
        daily_table="stock_trade_daily",
        sync_start_date=_START,
        today=_TODAY,
    )
    assert cal == (date(2025, 1, 1), date(2025, 12, 31))
    assert daily == cal


def test_ymd_roundtrip():
    assert date_to_ymd(date(2026, 6, 10)) == "20260610"
    assert ymd_to_date("20260610") == date(2026, 6, 10)


def test_rate_limit_wait_seconds():
    assert parse_tushare_rate_limit_wait_seconds("频率超限(1次/小时)") == 3630.0


def test_hourly_rate_limit_defers_instead_of_long_sleep():
    assert parse_tushare_rate_limit_wait_seconds("频率超限(1次/小时)") > DEFER_RETRY_AFTER_SECONDS
    err = TushareRateLimitError(
        api_name="trade_cal",
        retry_after_seconds=3661,
        message="频率超限(1次/小时)",
    )
    assert err.api_name == "trade_cal"
    assert err.retry_after_seconds == 3661.0


def test_sync_stock_basic_single_api_call():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"stock_basic": "dataset-1"}

    dataset = MagicMock()
    dataset.schema_name = "tushare"
    dataset.table_name = "stock_basic"
    data_source = MagicMock()
    client = MagicMock()
    client.query = AsyncMock(
        return_value=[{"ts_code": "000001.SZ", "symbol": "000001", "name": "平安银行"}]
    )
    engine = MagicMock()

    async def _run():
        with (
            patch(
                "app.services.connector_sync.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(dataset, data_source),
            ),
            patch("app.services.connector_sync.tushare.sync.upsert_rows", return_value=1) as mock_upsert,
        ):
            written = await sync_stock_basic(client, MagicMock(), connector, engine=engine)
        assert written == 1
        client.query.assert_awaited_once()
        assert client.query.await_args.args[0] == "stock_basic"
        assert client.query.await_args.args[1] == {"list_status": "L"}
        mock_upsert.assert_called_once()

    asyncio.run(_run())


def test_tushare_client_requires_token():
    with pytest.raises(ValueError, match="TUSHARE_TOKEN"):
        TushareClient(token="")
