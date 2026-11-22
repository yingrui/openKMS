"""The web-search tool delegates to the backend, which owns the connector and its credential.

Two failure modes matter as much as the happy path: an installation without a connector must not look like "the web has
nothing", and a provider failure must reach the model as an error it can pass on rather than as silence.
"""
from __future__ import annotations

import json
from unittest.mock import patch

import pytest

from qa_agent.skills import web_search as module
from qa_agent.skills.web_search import EXTERNAL_NOTE, search_web


@pytest.fixture(autouse=True)
def _bound_connector():
    """Most paths assume the agent has a connector bound; the unbound case is its own test."""
    from qa_agent import request_context

    token = request_context.set_web_search_connector("conn-1")
    try:
        yield
    finally:
        request_context.reset_web_search_connector(token)


def _call(**kwargs) -> str:
    return search_web.func(query="rates", _config={}, **kwargs)


def test_results_come_back_with_the_external_note():
    payload = {
        "query": "rates",
        "connector": "zhipu-search",
        "results": [{"title": "Rates", "url": "https://example.com/r", "content": "5.5%"}],
    }
    with patch.object(module, "_post_json", return_value=payload) as post:
        out = json.loads(_call())
    assert out["results"][0]["url"] == "https://example.com/r"
    assert out["connector"] == "zhipu-search"
    assert out["note"] == EXTERNAL_NOTE
    # The credential stays with the backend: the tool posts a query, never a key.
    assert post.call_args.kwargs["payload"]["query"] == "rates"


def test_no_connector_is_reported_as_not_configured():
    with patch.object(
        module,
        "_post_json",
        side_effect=RuntimeError("Backend web search returned HTTP 404: Web search is not configured"),
    ):
        out = _call()
    assert out.startswith("Error:") and "not configured" in out


def test_a_provider_failure_reaches_the_model():
    with patch.object(
        module,
        "_post_json",
        side_effect=RuntimeError("Backend web search returned HTTP 502: Zhipu web search failed (401)"),
    ):
        out = _call()
    assert "502" in out and out.startswith("Error:")


def test_the_limit_is_bounded():
    payload = {"query": "q", "connector": "c", "results": []}
    with patch.object(module, "_post_json", return_value=payload) as post:
        _call(max_results=50)
    assert post.call_args.kwargs["payload"]["limit"] == 10


def test_without_a_bound_connector_the_tool_says_so():
    """The capability can be on before an operator binds a connector; the tool must not go looking for another one."""
    from qa_agent import request_context

    token = request_context.set_web_search_connector("")
    try:
        with patch.object(module, "_post_json", side_effect=AssertionError("must not call the backend")):
            out = _call()
    finally:
        request_context.reset_web_search_connector(token)
    assert "no search connector is bound" in out


def test_the_bound_connector_travels_with_the_request():
    from qa_agent import request_context

    token = request_context.set_web_search_connector("conn-7")
    try:
        with patch.object(
            module, "_post_json", return_value={"query": "q", "connector": "deepseek", "results": []}
        ) as post:
            _call()
    finally:
        request_context.reset_web_search_connector(token)
    assert post.call_args.kwargs["payload"]["connector_id"] == "conn-7"
