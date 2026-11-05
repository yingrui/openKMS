"""OpenAI-compatible gateway helpers (thinking / reasoning_content).

Neutral primitives — no Wiki / Deep Agents product coupling. Callers bind their
own settings and build clients.
"""

from __future__ import annotations

import json
import logging
from typing import Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_SHIM_CLS: type | None = None

# Streaming read timeout is the longest tolerated gap between chunks, so it can be short:
# a provider or middlebox that drops a connection mid-turn leaves the socket ESTABLISHED but
# silent, and without a bound the client waits forever while the surrounding turn stays
# "running". Non-streaming read timeout covers a whole completion instead, so it must allow
# for `agent_max_output_tokens` on a slow model.
DEFAULT_STREAM_TIMEOUT = httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=10.0)
DEFAULT_BLOCKING_TIMEOUT = httpx.Timeout(connect=10.0, read=1800.0, write=60.0, pool=10.0)


def chat_extra_body_disable_thinking(raw_json: str | None) -> dict[str, Any]:
    """Merge optional JSON into extra_body; always force ``enable_thinking`` false."""
    extra: dict[str, Any] = {}
    raw = (raw_json or "").strip()
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                extra.update(parsed)
        except (json.JSONDecodeError, TypeError):
            logger.warning("LLM extra_body JSON is invalid; ignoring")
    # DeepSeek/DashScope thinking + tools require reasoning_content round-trip;
    # callers that only shim empty keys must disable thinking.
    extra["enable_thinking"] = False
    return extra


def use_reasoning_content_shim(base_url: str, *, setting: str | None) -> bool:
    """Whether to inject ``reasoning_content`` on assistant rows for this base_url."""
    raw = (setting or "").strip().lower()
    if raw in ("0", "false", "no", "off"):
        return False
    if raw in ("1", "true", "yes", "on", "force"):
        return True
    try:
        host = (urlparse(base_url).hostname or "").lower()
    except ValueError:
        host = ""
    if host == "api.openai.com":
        return False
    return True


def inject_reasoning_content_on_assistant_rows(
    messages: list[dict[str, Any]],
    *,
    use_shim: bool,
) -> None:
    """Some gateways require ``reasoning_content`` on every assistant row in tool loops."""
    if not use_shim:
        return
    for row in messages:
        if isinstance(row, dict) and row.get("role") == "assistant":
            row["reasoning_content"] = row.get("reasoning_content") or ""


def _reasoning_content_shim_chat_openai_cls() -> type:
    global _SHIM_CLS
    if _SHIM_CLS is not None:
        return _SHIM_CLS

    from langchain_core.language_models import LanguageModelInput
    from langchain_openai import ChatOpenAI

    class ReasoningContentShimChatOpenAI(ChatOpenAI):
        def _get_request_payload(
            self,
            input_: LanguageModelInput,
            *,
            stop: list[str] | None = None,
            **kwargs: Any,
        ) -> dict[str, Any]:
            payload = super()._get_request_payload(input_, stop=stop, **kwargs)
            if self._use_responses_api(payload):
                return payload
            raw_messages = payload.get("messages")
            if isinstance(raw_messages, list):
                inject_reasoning_content_on_assistant_rows(raw_messages, use_shim=True)
            return payload

    _SHIM_CLS = ReasoningContentShimChatOpenAI
    return _SHIM_CLS


def make_langchain_chat_openai(
    *,
    base_url: str,
    api_key: str,
    model_name: str,
    temperature: float,
    streaming: bool,
    extra_body: dict[str, Any],
    use_shim: bool,
    max_tokens: int | None = None,
    timeout: httpx.Timeout | None = None,
) -> Any:
    """Build ChatOpenAI; optionally inject empty ``reasoning_content`` on assistant rows.

    ``timeout`` must never be left to langchain: its ``request_timeout`` defaults to ``None``
    and is forwarded to ``AsyncOpenAI(timeout=None)``, which *disables* the SDK's own
    ``read=600s`` bound. A provider that drops the stream then leaves the request pending
    forever, so a stalled turn never errors and never releases its ``last_turn`` lease.
    """
    from langchain_openai import ChatOpenAI

    common: dict[str, Any] = {
        "base_url": base_url,
        "api_key": api_key,
        "model": model_name,
        "temperature": temperature,
        "streaming": streaming,
        "extra_body": extra_body,
        "timeout": timeout
        or (DEFAULT_STREAM_TIMEOUT if streaming else DEFAULT_BLOCKING_TIMEOUT),
    }
    if max_tokens is not None:
        common["max_tokens"] = max_tokens
    if use_shim:
        return _reasoning_content_shim_chat_openai_cls()(**common)
    return ChatOpenAI(**common)
