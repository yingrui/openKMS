"""Unit tests for connector catalog (kinds, secret validation, merge rules, I/O)."""

import pytest

from app.services.connector_catalog import (
    merge_secrets_encrypted,
    normalize_and_validate_inputs,
    normalize_and_validate_outputs,
    validate_kind,
    validate_secrets_for_kind,
)


def test_validate_kind_tushare():
    validate_kind("tushare")


def test_validate_kind_unknown():
    with pytest.raises(ValueError, match="Unknown connector kind"):
        validate_kind("not_a_kind")


def test_validate_secrets_tushare_ok():
    validate_secrets_for_kind("tushare", {"TUSHARE_TOKEN": "tok"})


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


def test_tushare_outputs_requires_both_slots():
    with pytest.raises(ValueError, match="stock_trade_daily"):
        normalize_and_validate_outputs("tushare", {"trade_calendar": "ds1"})
    out = normalize_and_validate_outputs(
        "tushare",
        {"stock_trade_daily": "a" * 32, "trade_calendar": "b" * 32},
    )
    assert set(out.keys()) == {"stock_trade_daily", "trade_calendar"}
