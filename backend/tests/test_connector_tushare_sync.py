"""Unit tests for Tushare sync helpers."""

import asyncio
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.data.connectors.pg import date_to_ymd, ymd_to_date
from app.services.data.connectors.sync_range import SyncDateRange
from app.services.data.connectors.tushare.client import (
    DEFER_RETRY_AFTER_SECONDS,
    TushareClient,
    TushareRateLimitError,
    parse_tushare_rate_limit_wait_seconds,
)
from app.services.data.connectors.tushare.sync import (
    _DEFAULT_INDEX_CODES,
    _resolve_tushare_windows,
    _sync_settings,
    _year_chunks,
    merge_index_codes,
    parse_index_codes,
    sync_stock_basic,
    sync_daily_basic,
    sync_index_basic,
    sync_index_daily,
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
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(dataset, data_source),
            ),
            patch("app.services.data.connectors.tushare.sync.upsert_rows", return_value=1) as mock_upsert,
        ):
            written = await sync_stock_basic(client, MagicMock(), connector, engine=engine)
        assert written == 1
        client.query.assert_awaited_once()
        assert client.query.await_args.args[0] == "stock_basic"
        assert client.query.await_args.args[1] == {"list_status": "L"}
        mock_upsert.assert_called_once()

    asyncio.run(_run())


def test_sync_daily_basic_one_api_call_per_trade_date():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"daily_basic": "dataset-1"}

    dataset = MagicMock()
    dataset.schema_name = "tushare"
    dataset.table_name = "daily_basic"
    data_source = MagicMock()
    calendar_dataset = MagicMock()
    calendar_dataset.schema_name = "tushare"
    calendar_dataset.table_name = "trade_calendar"
    client = MagicMock()
    client.query = AsyncMock(
        return_value=[
            {
                "ts_code": "000001.SZ",
                "trade_date": "20260610",
                "close": 10.5,
                "turnover_rate": 1.2,
                "limit_status": 1,
            }
        ]
    )
    engine = MagicMock()

    async def _run():
        with (
            patch(
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(dataset, data_source),
            ),
            patch(
                "app.services.data.connectors.tushare.sync._resolve_open_trade_dates",
                new_callable=AsyncMock,
                return_value=["20260610"],
            ),
            patch("app.services.data.connectors.tushare.sync.pg_engine_for_datasource", return_value=engine),
            patch("app.services.data.connectors.tushare.sync.upsert_rows", return_value=1) as mock_upsert,
        ):
            written = await sync_daily_basic(
                client,
                MagicMock(),
                connector,
                start=date(2026, 6, 10),
                end=date(2026, 6, 10),
                calendar_dataset=calendar_dataset,
                calendar_engine=engine,
            )
        assert written == 1
        client.query.assert_awaited_once()
        assert client.query.await_args.args[0] == "daily_basic"
        assert client.query.await_args.args[1] == {"trade_date": "20260610"}
        mock_upsert.assert_called_once()

    asyncio.run(_run())


def test_tushare_client_requires_token():
    with pytest.raises(ValueError, match="TUSHARE_TOKEN"):
        TushareClient(token="")


def test_parse_index_codes_default_and_custom():
    assert parse_index_codes(None) == _DEFAULT_INDEX_CODES
    assert parse_index_codes("") == _DEFAULT_INDEX_CODES
    assert parse_index_codes("000300.sh, 000905.SH ,000300.SH") == (
        "000300.SH",
        "000905.SH",
    )
    assert parse_index_codes(["399006.SZ"]) == ("399006.SZ",)


def test_parse_index_codes_rejects_bad_code():
    with pytest.raises(ValueError, match="Invalid index code"):
        parse_index_codes("000300")


def test_settings_parse_index_filters():
    cfg = _sync_settings(
        {"sync_index_markets": "sse, szse", "sync_index_categories": "规模指数,行业指数"}
    )
    assert cfg["index_markets"] == ("SSE", "SZSE")
    assert cfg["index_categories"] == ("规模指数", "行业指数")
    # JSON arrays arrive as lists from the KV editor's `parseSettingValue`.
    cfg = _sync_settings({"sync_index_markets": ["CSI"], "sync_index_categories": []})
    assert cfg["index_markets"] == ("CSI",)
    assert cfg["index_categories"] == ()


def test_settings_without_index_filters_derive_nothing():
    cfg = _sync_settings(None)
    assert cfg["index_markets"] == ()
    assert cfg["index_categories"] == ()
    assert cfg["index_codes"] == _DEFAULT_INDEX_CODES


def test_merge_index_codes_keeps_explicit_order_and_dedupes():
    assert merge_index_codes(("000300.SH", "000001.SH"), ("000001.SH", "000905.SH")) == (
        "000300.SH",
        "000001.SH",
        "000905.SH",
    )


def test_year_chunks_splits_on_calendar_boundaries():
    assert _year_chunks(date(2025, 12, 20), date(2026, 3, 1)) == [
        (date(2025, 12, 20), date(2025, 12, 31)),
        (date(2026, 1, 1), date(2026, 3, 1)),
    ]
    assert _year_chunks(date(2026, 1, 1), date(2026, 6, 10)) == [
        (date(2026, 1, 1), date(2026, 6, 10)),
    ]


def test_sync_index_basic_walks_every_market():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"index_basic": "dataset-1"}

    dataset = MagicMock()
    dataset.schema_name = "tushare"
    dataset.table_name = "index_basic"
    client = MagicMock()
    client.query = AsyncMock(
        return_value=[
            {
                "ts_code": "000300.SH",
                "name": "沪深300",
                "market": "SSE",
                "base_date": "20041231",
                "base_point": 1000.0,
                "desc": "沪深300指数",
            }
        ]
    )

    async def _run():
        with (
            patch(
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(dataset, MagicMock()),
            ),
            patch("app.services.data.connectors.tushare.sync.pg_engine_for_datasource", return_value=MagicMock()),
            patch("app.services.data.connectors.tushare.sync.upsert_rows", return_value=1) as mock_upsert,
        ):
            written = await sync_index_basic(client, MagicMock(), connector)
        # One call per market; a short page ends pagination for that market.
        assert client.query.await_count == 7
        assert {c.args[1]["market"] for c in client.query.await_args_list} == {
            "SSE",
            "SZSE",
            "CSI",
            "CICC",
            "SW",
            "MSCI",
            "OTH",
        }
        written_row = mock_upsert.call_args.kwargs["rows"][0]
        assert written_row["description"] == "沪深300指数"
        assert written == 7

    asyncio.run(_run())


def test_sync_index_daily_incremental_per_code():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"index_daily": "dataset-1"}

    dataset = MagicMock()
    dataset.schema_name = "tushare"
    dataset.table_name = "index_daily"
    client = MagicMock()
    client.query = AsyncMock(
        return_value=[
            {
                "ts_code": "000300.SH",
                "trade_date": "20260610",
                "close": 3900.1,
                "open": 3880.0,
                "high": 3910.0,
                "low": 3870.0,
                "pre_close": 3885.0,
                "change": 15.1,
                "pct_chg": 0.39,
                "vol": 123456.0,
                "amount": 9876543.0,
            }
        ]
    )

    async def _run():
        with (
            patch(
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(dataset, MagicMock()),
            ),
            patch("app.services.data.connectors.tushare.sync.pg_engine_for_datasource", return_value=MagicMock()),
            patch(
                "app.services.data.connectors.tushare.sync.max_ymd_in_table_where",
                return_value="20260609",
            ) as mock_max,
            patch("app.services.data.connectors.tushare.sync.upsert_rows", return_value=1) as mock_upsert,
        ):
            written = await sync_index_daily(
                client,
                MagicMock(),
                connector,
                start=None,
                end=date(2026, 6, 10),
                index_codes=("000300.SH", "000905.SH"),
                sync_start_date=_START,
            )
        assert written == 2
        assert mock_max.call_count == 2
        assert mock_max.call_args.kwargs["where_value"] == "000905.SH"
        assert client.query.await_count == 2
        params = client.query.await_args.args[1]
        assert params == {
            "ts_code": "000905.SH",
            "start_date": "20260609",
            "end_date": "20260610",
        }
        mock_upsert.assert_called()

    asyncio.run(_run())


def test_sync_index_daily_derives_codes_from_catalog():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"index_daily": "dataset-1", "index_basic": "dataset-2"}

    index_daily_dataset = MagicMock()
    index_daily_dataset.schema_name = "tushare"
    index_daily_dataset.table_name = "index_daily"
    catalog_dataset = MagicMock()
    catalog_dataset.schema_name = "tushare"
    catalog_dataset.table_name = "index_basic"
    client = MagicMock()
    client.query = AsyncMock(return_value=[])

    async def _load(_db, _outputs, slot):
        return (index_daily_dataset, MagicMock()) if slot == "index_daily" else (catalog_dataset, MagicMock())

    async def _run():
        with (
            patch(
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                side_effect=_load,
            ),
            patch("app.services.data.connectors.tushare.sync.pg_engine_for_datasource", return_value=MagicMock()),
            patch(
                "app.services.data.connectors.tushare.sync.index_codes_from_table",
                return_value=("000300.SH", "000905.SH"),
            ) as mock_catalog,
        ):
            await sync_index_daily(
                client,
                MagicMock(),
                connector,
                start=date(2026, 6, 10),
                end=date(2026, 6, 10),
                index_codes=("000300.SH",),
                sync_start_date=_START,
                index_markets=("SSE", "SZSE"),
                index_categories=("规模指数",),
            )
        assert mock_catalog.call_args.kwargs["markets"] == ("SSE", "SZSE")
        assert mock_catalog.call_args.kwargs["categories"] == ("规模指数",)
        # Explicit 000300.SH + catalog 000300.SH/000905.SH → two codes, one call each.
        assert [c.args[1]["ts_code"] for c in client.query.await_args_list] == [
            "000300.SH",
            "000905.SH",
        ]

    asyncio.run(_run())


def test_sync_index_daily_rejects_empty_catalog_match():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"index_daily": "dataset-1", "index_basic": "dataset-2"}

    catalog_dataset = MagicMock()
    catalog_dataset.schema_name = "tushare"
    catalog_dataset.table_name = "index_basic"
    client = MagicMock()
    client.query = AsyncMock(return_value=[])

    async def _run():
        with (
            patch(
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(catalog_dataset, MagicMock()),
            ),
            patch("app.services.data.connectors.tushare.sync.pg_engine_for_datasource", return_value=MagicMock()),
            patch("app.services.data.connectors.tushare.sync.index_codes_from_table", return_value=()),
        ):
            await sync_index_daily(
                client,
                MagicMock(),
                connector,
                start=None,
                end=date(2026, 6, 10),
                index_codes=("000300.SH",),
                sync_start_date=_START,
                index_markets=("SSE",),
                index_categories=("规模指数啊",),
            )

    with pytest.raises(ValueError, match="matched no index"):
        asyncio.run(_run())
    client.query.assert_not_awaited()


def test_sync_index_daily_explicit_window_chunks_by_year():
    connector = MagicMock()
    connector.id = "conn-1"
    connector.outputs = {"index_daily": "dataset-1"}

    dataset = MagicMock()
    dataset.schema_name = "tushare"
    dataset.table_name = "index_daily"
    client = MagicMock()
    client.query = AsyncMock(return_value=[])

    async def _run():
        with (
            patch(
                "app.services.data.connectors.tushare.sync._load_output_dataset",
                new_callable=AsyncMock,
                return_value=(dataset, MagicMock()),
            ),
            patch("app.services.data.connectors.tushare.sync.pg_engine_for_datasource", return_value=MagicMock()),
            patch(
                "app.services.data.connectors.tushare.sync.max_ymd_in_table_where",
            ) as mock_max,
            patch("app.services.data.connectors.tushare.sync.upsert_rows", return_value=0) as mock_upsert,
        ):
            written = await sync_index_daily(
                client,
                MagicMock(),
                connector,
                start=date(2025, 12, 20),
                end=date(2026, 6, 10),
                index_codes=("000300.SH",),
                sync_start_date=_START,
            )
        assert written == 0
        mock_max.assert_not_called()
        mock_upsert.assert_not_called()
        # Explicit window is chunked by calendar year.
        assert client.query.await_count == 2
        assert [c.args[1]["start_date"] for c in client.query.await_args_list] == [
            "20251220",
            "20260101",
        ]

    asyncio.run(_run())


def test_sync_connector_runs_only_selected_slots():
    from app.services.data.connectors.tushare.sync import sync_tushare_connector

    connector = MagicMock()
    connector.id = "conn-1"
    connector.kind = "tushare"
    connector.settings = None
    connector.inputs = {"api_base_url": "https://api.tushare.pro"}
    connector.outputs = {slot: f"dataset-{slot}" for slot in (
        "trade_calendar", "stock_basic", "stock_trade_daily", "daily_basic",
        "stock_adj_daily", "dividends", "index_basic", "index_daily",
    )}

    dataset = MagicMock()
    dataset.schema_name = "tushare"
    dataset.table_name = "table"

    slot_mocks = {
        name: AsyncMock(return_value=1)
        for name in (
            "sync_trade_calendar", "sync_stock_basic", "sync_stock_trade_daily",
            "sync_daily_basic", "sync_stock_adj_daily", "sync_dividends",
            "sync_index_basic", "sync_index_daily",
        )
    }

    patchers = [
        patch(
            "app.services.data.connectors.tushare.sync.decrypt_secrets_blob",
            return_value={"TUSHARE_TOKEN": "tok"},
        ),
        patch(
            "app.services.data.connectors.tushare.sync._load_output_dataset",
            new_callable=AsyncMock,
            return_value=(dataset, MagicMock()),
        ),
        patch(
            "app.services.data.connectors.tushare.sync.pg_engine_for_datasource",
            return_value=MagicMock(),
        ),
        patch(
            "app.services.data.connectors.tushare.sync._resolve_tushare_windows",
            return_value=((date(2026, 1, 1), date(2026, 1, 2)), (date(2026, 1, 1), date(2026, 1, 2))),
        ),
        *(patch(f"app.services.data.connectors.tushare.sync.{name}", mock) for name, mock in slot_mocks.items()),
    ]
    for p in patchers:
        p.start()

    async def _run():
        return await sync_tushare_connector(
            MagicMock(),
            connector,
            start_date="2026-01-01",
            end_date="2026-01-02",
            slots=["index_daily", "index_basic"],
        )

    try:
        stats = asyncio.run(_run())
    finally:
        for p in patchers:
            p.stop()

    assert stats == {"index_basic": 1, "index_daily": 1}
    assert slot_mocks["sync_index_daily"].await_count == 1
    assert slot_mocks["sync_index_basic"].await_count == 1
    for name, mock in slot_mocks.items():
        if name not in ("sync_index_basic", "sync_index_daily"):
            assert mock.await_count == 0, name


def test_sync_connector_rejects_unknown_slot():
    from app.services.data.connectors.tushare.sync import sync_tushare_connector

    connector = MagicMock()
    connector.id = "conn-1"
    connector.kind = "tushare"

    with pytest.raises(ValueError, match="Unknown output slot"):
        asyncio.run(
            sync_tushare_connector(
                MagicMock(),
                connector,
                start_date="2026-01-01",
                end_date="2026-01-02",
                slots=["index_weight"],
            )
        )
