"""Neutral openai_compat thinking helpers + Deep Agents llm_chat facade."""

from __future__ import annotations

from unittest.mock import patch

import httpx
from langchain_core.messages import AIMessage, HumanMessage

from app.services.deep_agents.llm_chat import (
    build_deep_agent_chat_openai,
    deep_agent_chat_extra_body,
    deep_agent_use_reasoning_content_shim,
)
from app.services.openai_compat import (
    chat_extra_body_disable_thinking,
    inject_reasoning_content_on_assistant_rows,
    use_reasoning_content_shim,
)
from app.services.openai_compat.thinking import (
    DEFAULT_BLOCKING_TIMEOUT,
    DEFAULT_STREAM_TIMEOUT,
    make_langchain_chat_openai,
)


def test_chat_extra_body_forces_enable_thinking_false() -> None:
    body = chat_extra_body_disable_thinking('{"enable_thinking": true, "foo": 1}')
    assert body["enable_thinking"] is False
    assert body["foo"] == 1


def test_shim_auto_skips_openai_host() -> None:
    assert use_reasoning_content_shim("https://api.openai.com/v1", setting=None) is False
    assert use_reasoning_content_shim("https://api.deepseek.com/v1", setting=None) is True
    assert use_reasoning_content_shim("https://api.deepseek.com/v1", setting="false") is False


def test_inject_reasoning_content() -> None:
    rows = [{"role": "assistant", "content": "hi"}, {"role": "user", "content": "x"}]
    inject_reasoning_content_on_assistant_rows(rows, use_shim=True)
    assert rows[0]["reasoning_content"] == ""
    assert "reasoning_content" not in rows[1]


def test_deep_agent_facade_binds_settings(monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.agent_llm_extra_body_json", '{"foo": 2}')
    monkeypatch.setattr("app.config.settings.agent_llm_reasoning_content_shim", None)
    body = deep_agent_chat_extra_body()
    assert body["enable_thinking"] is False
    assert body["foo"] == 2
    assert deep_agent_use_reasoning_content_shim("https://api.deepseek.com/v1") is True


def test_build_deep_agent_chat_openai_injects_reasoning_content(monkeypatch) -> None:
    monkeypatch.setattr("app.config.settings.agent_llm_extra_body_json", "")
    monkeypatch.setattr("app.config.settings.agent_llm_reasoning_content_shim", None)
    llm = build_deep_agent_chat_openai(
        base_url="https://api.deepseek.com/v1",
        api_key="test",
        model_name="deepseek-chat",
        temperature=0.2,
        streaming=False,
        max_tokens=128,
    )
    assert llm.extra_body.get("enable_thinking") is False
    with patch.object(llm, "_use_responses_api", return_value=False):
        payload = llm._get_request_payload(
            [HumanMessage(content="hi"), AIMessage(content="hello")],
        )
    rows = payload["messages"]
    asst = next(r for r in rows if r.get("role") == "assistant")
    assert asst.get("reasoning_content") == ""


def test_chat_openai_timeout_is_bounded_not_disabled(monkeypatch) -> None:
    """langchain's ``request_timeout=None`` disables the SDK bound; we must always set one.

    A dropped provider connection then surfaces as APITimeoutError instead of leaving the
    turn pending forever with ``last_turn.status=running``.
    """
    monkeypatch.setattr("app.config.settings.agent_llm_extra_body_json", "")
    monkeypatch.setattr("app.config.settings.agent_llm_reasoning_content_shim", None)
    llm = build_deep_agent_chat_openai(
        base_url="https://api.deepseek.com/v1",
        api_key="test",
        model_name="deepseek-chat",
        temperature=0.2,
        streaming=True,
    )
    effective = llm.root_async_client.timeout
    assert effective is not None, "timeout=None would wait forever on a stalled stream"
    assert effective.read == DEFAULT_STREAM_TIMEOUT.read


def test_streaming_and_blocking_timeouts_differ() -> None:
    """Streaming bounds the gap between chunks; blocking bounds a whole completion."""
    assert DEFAULT_STREAM_TIMEOUT.read < DEFAULT_BLOCKING_TIMEOUT.read


def test_make_langchain_chat_openai_accepts_explicit_timeout() -> None:
    custom = httpx.Timeout(connect=1.0, read=7.0, write=1.0, pool=1.0)
    llm = make_langchain_chat_openai(
        base_url="https://example.test/v1",
        api_key="k",
        model_name="m",
        temperature=0.0,
        streaming=True,
        extra_body={},
        use_shim=False,
        timeout=custom,
    )
    assert llm.root_async_client.timeout.read == 7.0
