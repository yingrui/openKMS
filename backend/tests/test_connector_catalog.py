"""Unit tests for connector catalog (kinds, secret validation, merge rules, I/O)."""

import pytest

from app.services.connector_catalog import (
    CATEGORY_SEARCH_TOOL,
    CATEGORY_SYNC,
    merge_secrets_encrypted,
    normalize_and_validate_inputs,
    normalize_and_validate_outputs,
    normalize_and_validate_settings,
    validate_kind,
    validate_secrets_for_kind,
    get_kind_spec,
)


def test_validate_kind_tushare():
    validate_kind("tushare")


def test_validate_kind_zhipu():
    validate_kind("zhipu_web_search")


def test_validate_kind_unknown():
    with pytest.raises(ValueError, match="Unknown connector kind"):
        validate_kind("not_a_kind")


def test_tushare_category_sync():
    assert get_kind_spec("tushare").category == CATEGORY_SYNC


def test_zhipu_category_search_tool():
    spec = get_kind_spec("zhipu_web_search")
    assert spec.category == CATEGORY_SEARCH_TOOL
    assert spec.output_slots == ()
    assert spec.output_schema is not None
    assert "results" in spec.output_schema.get("properties", {})


def test_validate_secrets_tushare_ok():
    validate_secrets_for_kind("tushare", {"TUSHARE_TOKEN": "tok"})


def test_validate_secrets_zhipu_ok():
    validate_secrets_for_kind("zhipu_web_search", {"ZHIPU_API_KEY": "key"})


def test_validate_secrets_tushare_rejects_unknown_key():
    with pytest.raises(ValueError, match="Unknown secret key"):
        validate_secrets_for_kind("tushare", {"OTHER": "x"})


def test_merge_none_patch_keeps_cipher():
    assert merge_secrets_encrypted("keep-me", None, kind="tushare") == "keep-me"


def test_merge_empty_dict_returns_none():
    assert merge_secrets_encrypted("ignored", {}, kind="tushare") is None


def test_tushare_inputs_default_api_url():
    out = normalize_and_validate_inputs("tushare", None)
    assert out["api_base_url"] == "https://api.tushare.pro"


def test_tushare_inputs_custom_url():
    out = normalize_and_validate_inputs("tushare", {"api_base_url": "https://example.com/"})
    assert out["api_base_url"] == "https://example.com/"


def test_tushare_inputs_rejects_bad_url():
    with pytest.raises(ValueError, match="valid http"):
        normalize_and_validate_inputs("tushare", {"api_base_url": "not-a-url"})


def test_tushare_outputs_allows_all_empty():
    assert normalize_and_validate_outputs("tushare", {}) == {}
    assert normalize_and_validate_outputs("tushare", None) == {}


def test_tushare_outputs_rejects_partial():
    with pytest.raises(ValueError, match="every output dataset"):
        normalize_and_validate_outputs(
            "tushare",
            {"trade_calendar": "a" * 32, "stock_basic": "b" * 32},
        )


def test_tushare_outputs_requires_all_slots_when_any_set():
    out = normalize_and_validate_outputs(
        "tushare",
        {
            "trade_calendar": "a" * 32,
            "stock_basic": "b" * 32,
            "stock_trade_daily": "c" * 32,
            "daily_basic": "f" * 32,
            "stock_adj_daily": "d" * 32,
            "dividends": "e" * 32,
        },
    )
    assert set(out.keys()) == {
        "trade_calendar",
        "stock_basic",
        "stock_trade_daily",
        "daily_basic",
        "stock_adj_daily",
        "dividends",
    }


def test_validate_sync_run_outputs_requires_all_slots():
    from app.services.connector_catalog import validate_sync_run_outputs

    with pytest.raises(ValueError, match="Configure all output datasets"):
        validate_sync_run_outputs("tushare", {})

    with pytest.raises(ValueError, match="Configure all output datasets"):
        validate_sync_run_outputs(
            "tushare",
            {"trade_calendar": "a" * 32, "stock_basic": "b" * 32},
        )

    validate_sync_run_outputs(
        "tushare",
        {
            "trade_calendar": "a" * 32,
            "stock_basic": "b" * 32,
            "stock_trade_daily": "c" * 32,
            "daily_basic": "f" * 32,
            "stock_adj_daily": "d" * 32,
            "dividends": "e" * 32,
        },
    )


def test_validate_sync_schedule_outputs_requires_datasets_when_enabled():
    from app.services.connector_catalog import validate_sync_schedule_outputs

    with pytest.raises(ValueError, match="Scheduled sync requires"):
        validate_sync_schedule_outputs(
            "tushare",
            {},
            {"sync_schedule": {"enabled": True, "cron": "5 15 * * *", "timezone": "UTC"}},
        )

    validate_sync_schedule_outputs(
        "tushare",
        {},
        {"sync_schedule": {"enabled": False, "cron": None, "timezone": "UTC"}},
    )


def test_zhipu_outputs_must_be_empty():
    assert normalize_and_validate_outputs("zhipu_web_search", None) == {}
    assert normalize_and_validate_outputs("zhipu_web_search", {}) == {}
    with pytest.raises(ValueError, match="does not use outputs"):
        normalize_and_validate_outputs("zhipu_web_search", {"x": "y"})


def test_zhipu_inputs_defaults():
    out = normalize_and_validate_inputs("zhipu_web_search", None)
    assert out["api_base_url"] == "https://open.bigmodel.cn/api/paas/v4"
    assert out["search_engine"] == "search_std"
    assert out["search_intent"] is False
    assert out["count"] == 10


def test_zhipu_settings_default_web_search_url():
    out = normalize_and_validate_settings("zhipu_web_search", None)
    assert out["web_search_url"] == "https://open.bigmodel.cn/api/paas/v4/web_search"


def test_zhipu_settings_custom_web_search_url():
    out = normalize_and_validate_settings(
        "zhipu_web_search",
        {"web_search_url": "https://open.bigmodel.cn/api/paas/v4/web_search"},
    )
    assert out["web_search_url"] == "https://open.bigmodel.cn/api/paas/v4/web_search"


def test_zhipu_inputs_boolean_and_select():
    out = normalize_and_validate_inputs(
        "zhipu_web_search",
        {
            "search_intent": "true",
            "search_engine": "search_pro",
            "count": "5",
            "content_size": "high",
            "search_recency_filter": "oneWeek",
        },
    )
    assert out["search_intent"] is True
    assert out["search_engine"] == "search_pro"
    assert out["count"] == 5
    assert out["content_size"] == "high"
    assert out["search_recency_filter"] == "oneWeek"

