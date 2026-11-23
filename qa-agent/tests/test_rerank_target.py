"""Where a rerank request goes, and which model it names.

Three faults were found live while wiring this, each of which produced a silent fallback:
the model id was resolved through the *chat* credentials route (404 for a reranker), the provider's base URL was
normalised to `/v1` (Zhipu's is `…/v4`), and "enabled but no endpoint" skipped the stage without saying so.
"""
from __future__ import annotations

import pytest

from qa_agent import retriever


@pytest.fixture(autouse=True)
def _no_env_rerank(monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "rerank_enabled", False, raising=False)


def test_a_named_model_uses_its_own_credentials_route(monkeypatch):
    calls: list[str] = []

    def fake(_settings, model_id):
        calls.append(model_id)
        return "https://open.bigmodel.cn/api/paas/v4", "rerank", "key"

    monkeypatch.setattr(retriever, "resolve_rerank_for_model", fake)
    url, model, key = retriever._rerank_endpoint("model_1")
    assert calls == ["model_1"]
    # Used as given: the provider documents `…/v4`, and `…/v4/v1/rerank` is a 404.
    assert url == "https://open.bigmodel.cn/api/paas/v4/rerank"
    assert (model, key) == ("rerank", "key")


def test_the_registered_default_is_used_when_the_request_names_none(monkeypatch):
    monkeypatch.setattr(
        retriever, "resolve_rerank_default", lambda _settings: ("https://gw.example/v1", "bge-reranker", "k2")
    )
    url, model, _key = retriever._rerank_endpoint(None)
    assert (url, model) == ("https://gw.example/v1/rerank", "bge-reranker")


def test_no_model_and_no_switch_means_no_rerank(monkeypatch):
    monkeypatch.setattr(retriever, "resolve_rerank_default", lambda _settings: None)
    assert retriever._rerank_endpoint(None) is None


def test_the_environment_variable_path_still_normalises_to_v1(monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(settings, "rerank_enabled", True, raising=False)
    monkeypatch.setattr(settings, "rerank_base_url", "https://gw.example", raising=False)
    monkeypatch.setattr(settings, "rerank_model_name", "env-model", raising=False)
    monkeypatch.setattr(retriever, "resolve_rerank_default", lambda _settings: None)
    url, model, _key = retriever._rerank_endpoint(None)
    # An OpenAI-compatible gateway states only its host; the `/v1` segment is the convention this path keeps.
    assert (url, model) == ("https://gw.example/v1/rerank", "env-model")


def test_an_unresolvable_model_skips_the_stage_instead_of_failing(monkeypatch):
    def boom(_settings, _model_id):
        raise RuntimeError("404")

    monkeypatch.setattr(retriever, "resolve_rerank_for_model", boom)
    assert retriever._rerank_endpoint("model_missing") is None


def test_the_choice_reaches_the_tool_through_the_request_context():
    """The runtime path: `invoke_agent` sets a ContextVar, the tool reads it.

    The first version read `config["configurable"]`, which the runtime never populates with these keys — every real
    answer skipped reranking while a hand-built config looked fine.
    """
    from qa_agent.request_context import (
        get_tool_rerank,
        reset_request_rerank,
        set_request_rerank,
    )

    assert get_tool_rerank(None) == (None, None)
    handle = set_request_rerank(True, "model_4590c369")
    try:
        assert get_tool_rerank(None) == (True, "model_4590c369")
        # A stale `configurable` must not win over the request's own value.
        assert get_tool_rerank({"configurable": {"rerank": False}}) == (True, "model_4590c369")
    finally:
        reset_request_rerank(handle)
    assert get_tool_rerank(None) == (None, None)
