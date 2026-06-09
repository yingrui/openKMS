"""Tests for optional Langfuse config on Deep Agents."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.services.deep_agents import langfuse as lf


@pytest.fixture(autouse=True)
def _reset_langfuse_circuit() -> None:
    lf._lf_circuit = "unknown"
    lf._lf_next_probe_at = 0.0
    lf._otel_silenced = False


def test_build_config_no_callbacks_when_langfuse_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langfuse_secret_key", None)
    monkeypatch.setattr(settings, "langfuse_public_key", None)
    monkeypatch.setattr(settings, "langfuse_base_url", None)

    cfg = lf.build_deep_agent_langgraph_config(conversation_id="conv-1", streaming=True)

    assert cfg["configurable"]["thread_id"] == "conv-1"
    assert "callbacks" not in cfg
    assert cfg["metadata"]["langfuse_session_id"] == "conv-1"
    assert cfg["metadata"]["langfuse_tags"] == ["deep-agent", "project-stream"]


def test_build_config_attaches_callback_when_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk")
    monkeypatch.setattr(settings, "langfuse_base_url", "https://lf.example")
    monkeypatch.setattr(settings, "langfuse_trace_streaming", True)
    monkeypatch.setattr(settings, "langfuse_healthcheck", False)

    handler = MagicMock()
    with patch.object(lf, "get_deep_agent_langfuse_callback", return_value=handler):
        cfg = lf.build_deep_agent_langgraph_config(
            conversation_id="conv-1",
            session_id="sess-abc",
            streaming=True,
            plan_mode=True,
        )

    assert cfg["callbacks"] == [handler]
    assert cfg["metadata"]["langfuse_session_id"] == "sess-abc"
    assert cfg["metadata"]["langfuse_tags"] == ["deep-agent", "project-stream", "plan-mode"]


def test_build_config_skips_stream_callback_when_trace_streaming_off(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk")
    monkeypatch.setattr(settings, "langfuse_base_url", "https://lf.example")
    monkeypatch.setattr(settings, "langfuse_trace_streaming", False)
    monkeypatch.setattr(settings, "langfuse_healthcheck", False)

    handler = MagicMock()
    with patch.object(lf, "get_deep_agent_langfuse_callback", return_value=handler):
        stream_cfg = lf.build_deep_agent_langgraph_config(conversation_id="c", streaming=True)
        sync_cfg = lf.build_deep_agent_langgraph_config(conversation_id="c", streaming=False)

    assert "callbacks" not in stream_cfg
    assert sync_cfg["callbacks"] == [handler]


def test_get_callback_none_when_healthcheck_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk")
    monkeypatch.setattr(settings, "langfuse_public_key", "pk")
    monkeypatch.setattr(settings, "langfuse_base_url", "https://lf.example")
    monkeypatch.setattr(settings, "langfuse_healthcheck", True)
    monkeypatch.setattr(settings, "langfuse_healthcheck_retry_seconds", 60)

    with patch.object(lf, "_langfuse_health_ok", return_value=False):
        assert lf.get_deep_agent_langfuse_callback() is None

    assert lf._lf_circuit == "down"
