"""Tests for Tushare connector probe helpers."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest

from app.services.connectors.tushare.probe import (
    _build_daily_params,
    _normalize_optional_date,
    run_tushare_probe,
)


def test_normalize_optional_date_accepts_iso_and_ymd():
    assert _normalize_optional_date("2026-06-10", field="trade_date") == "20260610"
    assert _normalize_optional_date("20260610", field="trade_date") == "20260610"
    assert _normalize_optional_date(None, field="trade_date") is None
    assert _normalize_optional_date("", field="trade_date") is None


def test_normalize_optional_date_rejects_invalid():
    with pytest.raises(ValueError, match="trade_date"):
        _normalize_optional_date("not-a-date", field="trade_date")


def test_build_daily_params_requires_filter():
    with pytest.raises(ValueError, match="at least one"):
        _build_daily_params(
            ts_code=None,
            trade_date=None,
            start_date=None,
            end_date=None,
            limit=None,
            offset=None,
        )


def test_build_daily_params_includes_limit_offset():
    params = _build_daily_params(
        ts_code="000001.SZ",
        trade_date=None,
        start_date="2026-01-01",
        end_date="2026-01-31",
        limit=100,
        offset=10,
    )
    assert params == {
        "ts_code": "000001.SZ",
        "start_date": "20260101",
        "end_date": "20260131",
        "limit": 100,
        "offset": 10,
    }


def test_run_tushare_probe_daily():
    class _Connector:
        kind = "tushare"
        inputs = {"api_base_url": "https://api.tushare.pro"}
        settings = None
        secrets_encrypted = "enc"

    rows = [{"ts_code": "000001.SZ", "trade_date": "20260610", "close": 10.5}]

    async def _run():
        with (
            patch(
                "app.services.connectors.tushare.probe.decrypt_secrets_blob",
                return_value={"TUSHARE_TOKEN": "token"},
            ),
            patch(
                "app.services.connectors.tushare.probe.TushareClient.query",
                new_callable=AsyncMock,
                return_value=rows,
            ) as mock_query,
        ):
            result = await run_tushare_probe(
                _Connector(),
                api_name="daily",
                trade_date="2026-06-10",
                ts_code="000001.SZ",
            )
        assert result["row_count"] == 1
        assert result["rows"] == rows
        assert result["params"]["trade_date"] == "20260610"
        assert result["debug"]["endpoint"] == "https://api.tushare.pro"
        mock_query.assert_awaited_once()
        call_args = mock_query.await_args
        assert call_args.args[0] == "daily"
        assert call_args.args[1]["trade_date"] == "20260610"
        assert call_args.args[1]["ts_code"] == "000001.SZ"

    asyncio.run(_run())
