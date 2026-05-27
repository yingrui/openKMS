"""Tests for LLM default resolution and merge logic (no HTTP in merge unit tests)."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from qa_agent.backend_defaults import _merge_agent_llm_defaults_payload, resolve_llm_for_agent
from qa_agent.config import Settings


@pytest.mark.parametrize(
    "need_url,need_model,need_key,data,expect_url,expect_model,expect_key",
    [
        (
            True,
            True,
            True,
            {"base_url": "https://llm/", "model_name": "M", "api_key": "secret"},
            "https://llm/",
            "M",
            "secret",
        ),
        (
            True,
            False,
            False,
            {"base_url": "https://x/", "model_name": "Resolved", "api_key": "k"},
            "https://x/",
            "",
            "",
        ),
    ],
)
def test_merge_agent_llm_defaults_payload(
    need_url: bool,
    need_model: bool,
    need_key: bool,
    data: dict,
    expect_url: str,
    expect_model: str,
    expect_key: str,
) -> None:
    url, model, key = _merge_agent_llm_defaults_payload(
        "",
        "",
        "",
        need_url=need_url,
        need_model=need_model,
        need_key=need_key,
        data=data,
    )
    assert url == expect_url
    assert model == expect_model
    assert key == expect_key


def test_resolve_skips_fetch_when_all_env_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENKMS_LLM_MODEL_BASE_URL", "http://env-llm/v1")
    monkeypatch.setenv("OPENKMS_LLM_MODEL_NAME", "EnvModel")
    monkeypatch.setenv("OPENKMS_LLM_MODEL_API_KEY", "envkey")
    cfg = Settings.model_construct(
        openkms_backend_url="http://api.example",
        llm_base_url="http://cfg/v1",
        llm_model_name="CfgModel",
        llm_api_key="cfgkey",
    )
    with patch("qa_agent.backend_defaults._fetch_agent_llm_defaults") as fetch:
        u, m, k = resolve_llm_for_agent(cfg)
        fetch.assert_not_called()
    assert u == "http://cfg/v1"
    assert m == "CfgModel"
    assert k == "cfgkey"


def test_resolve_merges_when_fetch_returns(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENKMS_LLM_MODEL_BASE_URL", raising=False)
    monkeypatch.delenv("OPENKMS_LLM_MODEL_NAME", raising=False)
    monkeypatch.delenv("OPENKMS_LLM_MODEL_API_KEY", raising=False)
    cfg = Settings.model_construct(
        openkms_backend_url="http://api.example",
        llm_base_url="",
        llm_model_name="",
        llm_api_key="",
    )
    fake = {"base_url": "https://merged/", "model_name": "MM", "api_key": "kk"}
    with patch("qa_agent.backend_defaults._fetch_agent_llm_defaults", return_value=fake):
        u, m, k = resolve_llm_for_agent(cfg)
    assert u == "https://merged/"
    assert m == "MM"
    assert k == "kk"
