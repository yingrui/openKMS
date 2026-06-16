"""Tushare dataset column contracts (schema ``tushare`` market tables)."""

from __future__ import annotations

from app.services.connector_sync.schemas import ConnectorDatasetColumn

TUSHARE_PG_SCHEMA = "tushare"

TUSHARE_TRADE_CALENDAR_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("exchange", "VARCHAR(10)", nullable=True, primary_key=True),
    ConnectorDatasetColumn("cal_date", "DATE", nullable=True, primary_key=True),
    ConnectorDatasetColumn("is_open", "INTEGER", nullable=True),
    ConnectorDatasetColumn("pretrade_date", "DATE", nullable=True),
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
    ConnectorDatasetColumn("ts_code", "TEXT", nullable=False, primary_key=True),
    ConnectorDatasetColumn("trade_date", "DATE", nullable=False, primary_key=True),
    ConnectorDatasetColumn("open", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("high", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("low", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("close", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pre_close", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("change", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pct_chg", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("vol", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("amount", "NUMERIC", nullable=True),
)

TUSHARE_DAILY_BASIC_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("ts_code", "TEXT", nullable=False, primary_key=True),
    ConnectorDatasetColumn("trade_date", "DATE", nullable=False, primary_key=True),
    ConnectorDatasetColumn("close", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("turnover_rate", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("turnover_rate_f", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("volume_ratio", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pe", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pe_ttm", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("pb", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("ps", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("ps_ttm", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("dv_ratio", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("dv_ttm", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("total_share", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("float_share", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("free_share", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("total_mv", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("circ_mv", "NUMERIC", nullable=True),
    ConnectorDatasetColumn("limit_status", "INTEGER", nullable=True),
)

TUSHARE_STOCK_ADJ_DAILY_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("ts_code", "VARCHAR(10)", nullable=True, primary_key=True),
    ConnectorDatasetColumn("trade_date", "DATE", nullable=True, primary_key=True),
    ConnectorDatasetColumn("adj_factor", "NUMERIC(10,4)", nullable=True),
)

TUSHARE_DIVIDENDS_COLUMNS: tuple[ConnectorDatasetColumn, ...] = (
    ConnectorDatasetColumn("ts_code", "VARCHAR(10)", nullable=True, primary_key=True),
    ConnectorDatasetColumn("ex_date", "DATE", nullable=True, primary_key=True),
    ConnectorDatasetColumn("end_date", "DATE", nullable=True),
    ConnectorDatasetColumn("ann_date", "DATE", nullable=True),
    ConnectorDatasetColumn("div_proc", "VARCHAR(24)", nullable=True),
    ConnectorDatasetColumn("stk_div", "NUMERIC(10,4)", nullable=True),
    ConnectorDatasetColumn("stk_bo_rate", "NUMERIC(10,4)", nullable=True),
    ConnectorDatasetColumn("stk_co_rate", "NUMERIC(10,4)", nullable=True),
    ConnectorDatasetColumn("cash_div", "NUMERIC(10,4)", nullable=True),
    ConnectorDatasetColumn("cash_div_tax", "NUMERIC(10,4)", nullable=True),
    ConnectorDatasetColumn("record_date", "DATE", nullable=True),
    ConnectorDatasetColumn("pay_date", "DATE", nullable=True),
    ConnectorDatasetColumn("div_listdate", "DATE", nullable=True),
    ConnectorDatasetColumn("imp_ann_date", "DATE", nullable=True),
    ConnectorDatasetColumn("base_date", "DATE", nullable=True),
    # 万股 (10k shares); large caps exceed NUMERIC(10,4) — e.g. 000617.SZ ≈ 1.26M 万股
    ConnectorDatasetColumn("base_share", "NUMERIC(20,4)", nullable=True),
    ConnectorDatasetColumn("update_flag", "VARCHAR(12)", nullable=True),
)
