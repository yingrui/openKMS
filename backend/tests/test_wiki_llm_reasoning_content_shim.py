"""Wiki agent: OpenAI SDK chat completions + optional reasoning_content assistant shim (TDD)."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from openai._utils import async_maybe_transform
from openai.types.chat import completion_create_params

from app.services.agent.wiki_runner import (
    _WikiReasoningContentShimChatOpenAI,
    _make_wiki_chat_openai,
    _wiki_use_llm_reasoning_content_shim,
)


def test_base_url_shim_detection() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_reasoning_content_shim = None
        assert _wiki_use_llm_reasoning_content_shim("https://dashscope.aliyuncs.com/compatible-mode/v1")
        assert _wiki_use_llm_reasoning_content_shim("https://corp-llm-gateway.local/v1")
        assert _wiki_use_llm_reasoning_content_shim("https://oss-cn-hangzhou.aliyuncs.com")
        assert not _wiki_use_llm_reasoning_content_shim("https://api.openai.com/v1")


def test_shim_env_force_true() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_reasoning_content_shim = "true"
        assert _wiki_use_llm_reasoning_content_shim("https://api.openai.com/v1")


def test_shim_env_force_false() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_reasoning_content_shim = "0"
        assert not _wiki_use_llm_reasoning_content_shim("https://dashscope.aliyuncs.com/compatible-mode/v1")


def test_shim_subclass_adds_reasoning_content_to_assistant_dicts() -> None:
    llm = _WikiReasoningContentShimChatOpenAI(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="sk-test",
        model="qwen-plus",
        temperature=0.2,
        streaming=False,
        extra_body={"enable_thinking": False},
    )
    msgs = [
        HumanMessage(content="hello"),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "list_wiki_pages",
                    "args": {},
                    "id": "call_abc",
                    "type": "tool_call",
                }
            ],
        ),
        ToolMessage(content="{}", tool_call_id="call_abc", name="list_wiki_pages"),
    ]
    payload = llm._get_request_payload(msgs)
    assert not llm._use_responses_api(payload)
    out_msgs = payload["messages"]
    assistants = [m for m in out_msgs if m.get("role") == "assistant"]
    assert len(assistants) >= 1
    for a in assistants:
        assert "reasoning_content" in a
        assert a["reasoning_content"] == ""


@pytest.mark.asyncio
async def test_shim_reasoning_content_survives_openai_request_body_transform() -> None:
    """Same transform the OpenAI Python SDK applies before HTTP."""
    llm = _WikiReasoningContentShimChatOpenAI(
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
        api_key="sk-test",
        model="qwen-plus",
        temperature=0.2,
        streaming=False,
        extra_body={"enable_thinking": False},
    )
    msgs = [
        HumanMessage(content="hello"),
        AIMessage(
            content="",
            tool_calls=[
                {
                    "name": "list_wiki_pages",
                    "args": {},
                    "id": "call_abc",
                    "type": "tool_call",
                }
            ],
        ),
        ToolMessage(content="{}", tool_call_id="call_abc", name="list_wiki_pages"),
    ]
    payload = llm._get_request_payload(msgs)
    transformed = await async_maybe_transform(
        {
            "model": payload["model"],
            "messages": payload["messages"],
            "stream": False,
        },
        completion_create_params.CompletionCreateParamsNonStreaming,
    )
    assistants = [m for m in transformed["messages"] if m.get("role") == "assistant"]
    assert assistants
    for a in assistants:
        assert a.get("reasoning_content") == "", a


def test_make_wiki_chat_openai_shim_except_public_openai_host() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_extra_body_json = None
        s.agent_max_output_tokens = 1024
        s.agent_llm_reasoning_content_shim = None
        ds = _make_wiki_chat_openai(
            base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
            api_key="x",
            model_name="qwen-plus",
            use_streaming=False,
        )
        oa = _make_wiki_chat_openai(
            base_url="https://api.openai.com/v1",
            api_key="x",
            model_name="gpt-4o-mini",
            use_streaming=False,
        )
    assert isinstance(ds, _WikiReasoningContentShimChatOpenAI)
    assert type(oa).__name__ == "ChatOpenAI"


def test_make_wiki_chat_openai_force_shim_for_generic_proxy_url() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_extra_body_json = None
        s.agent_max_output_tokens = 1024
        s.agent_llm_reasoning_content_shim = "1"
        proxied = _make_wiki_chat_openai(
            base_url="https://my-gateway.internal/v1",
            api_key="x",
            model_name="qwen-plus",
            use_streaming=False,
        )
    assert isinstance(proxied, _WikiReasoningContentShimChatOpenAI)


def test_auto_enables_shim_for_generic_proxy_without_explicit_env() -> None:
    with patch("app.services.agent.wiki_runner.settings") as s:
        s.agent_llm_extra_body_json = None
        s.agent_max_output_tokens = 1024
        s.agent_llm_reasoning_content_shim = None
        proxied = _make_wiki_chat_openai(
            base_url="https://corp-llm-gateway.local/v1",
            api_key="x",
            model_name="qwen-plus",
            use_streaming=False,
        )
    assert isinstance(proxied, _WikiReasoningContentShimChatOpenAI)


def test_plain_chatopenai_does_not_inject_reasoning_content_key() -> None:
    from langchain_openai import ChatOpenAI

    llm = ChatOpenAI(
        base_url="https://api.openai.com/v1",
        api_key="sk-test",
        model="gpt-4o-mini",
        temperature=0.2,
        streaming=False,
    )
    msgs = [HumanMessage(content="hi"), AIMessage(content="yo")]
    payload = llm._get_request_payload(msgs)
    for m in payload.get("messages") or []:
        if isinstance(m, dict) and m.get("role") == "assistant":
            assert "reasoning_content" not in m
