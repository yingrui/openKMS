"""Live Tushare API probes from the connector detail UI (no dataset writes)."""

from __future__ import annotations

from typing import Any

from app.models.connector import Connector
from app.services.connectors.connector_catalog import decrypt_secrets_blob
from app.services.connectors.pg import date_to_ymd, ymd_to_date
from app.services.connectors.tushare.client import TushareClient
from app.services.connectors.tushare.sync import _sync_settings

_PROBE_ROW_LIMIT = 100
_DAILY_FIELDS = "ts_code,trade_date,open,high,low,close,pre_close,change,pct_chg,vol,amount"
_SUPPORTED_APIS = frozenset({"daily"})


def _normalize_optional_date(value: str | None, *, field: str) -> str | None:
    if value is None:
        return None
    raw = value.strip()
    if not raw:
        return None
    parsed = ymd_to_date(raw.replace("-", ""))
    if not parsed:
        raise ValueError(f"{field} must be YYYYMMDD or YYYY-MM-DD.")
    return date_to_ymd(parsed)


def _build_daily_params(
    *,
    ts_code: str | None,
    trade_date: str | None,
    start_date: str | None,
    end_date: str | None,
    limit: int | None,
    offset: int | None,
) -> dict[str, str | int]:
    params: dict[str, str | int] = {}
    code = (ts_code or "").strip()
    if code:
        params["ts_code"] = code
    trade_ymd = _normalize_optional_date(trade_date, field="trade_date")
    if trade_ymd:
        params["trade_date"] = trade_ymd
    start_ymd = _normalize_optional_date(start_date, field="start_date")
    if start_ymd:
        params["start_date"] = start_ymd
    end_ymd = _normalize_optional_date(end_date, field="end_date")
    if end_ymd:
        params["end_date"] = end_ymd
    if limit is not None:
        params["limit"] = limit
    if offset is not None:
        params["offset"] = offset
    if not params or not any(k in params for k in ("ts_code", "trade_date", "start_date", "end_date")):
        raise ValueError(
            "Provide at least one of ts_code, trade_date, start_date, or end_date."
        )
    return params


async def run_tushare_probe(
    connector: Connector,
    *,
    api_name: str,
    ts_code: str | None = None,
    trade_date: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    limit: int | None = None,
    offset: int | None = None,
    include_debug: bool = True,
) -> dict[str, Any]:
    name = (api_name or "daily").strip().lower()
    if name not in _SUPPORTED_APIS:
        raise ValueError(f"Unsupported probe API '{api_name}'. Supported: {', '.join(sorted(_SUPPORTED_APIS))}.")

    params = _build_daily_params(
        ts_code=ts_code,
        trade_date=trade_date,
        start_date=start_date,
        end_date=end_date,
        limit=limit,
        offset=offset,
    )

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
        max_retries=2,
    )

    rows = await client.query(name, params, _DAILY_FIELDS)
    row_count = len(rows)
    truncated = row_count > _PROBE_ROW_LIMIT
    preview = rows[:_PROBE_ROW_LIMIT]

    out: dict[str, Any] = {
        "api_name": name,
        "params": params,
        "row_count": row_count,
        "truncated": truncated,
        "rows": preview,
    }
    if include_debug:
        out["debug"] = {
            "method": "POST",
            "endpoint": client.base_url,
            "api_name": name,
            "request_body": {
                "api_name": name,
                "params": params,
                "fields": _DAILY_FIELDS,
            },
        }
    return out
