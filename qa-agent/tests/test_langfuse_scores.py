"""Trace id and scores: the handle an evaluation needs, and a write that never fails a request."""
from unittest.mock import MagicMock, patch

import pytest

from qa_agent import langfuse_client


@pytest.fixture(autouse=True)
def enabled(monkeypatch):
    from qa_agent.config import settings

    monkeypatch.setattr(type(settings), "langfuse_enabled", property(lambda self: True))
    return None


class TestTraceId:
    """Read from the callback: the graph's span is closed by the time the answer exists."""

    def test_reads_the_handler_last_trace_id(self):
        handler = MagicMock()
        handler.last_trace_id = "trace-1"
        assert langfuse_client.current_trace_id(handler) == "trace-1"

    def test_none_without_a_handler(self):
        assert langfuse_client.current_trace_id(None) is None

    def test_none_when_the_handler_has_no_trace(self):
        handler = MagicMock()
        handler.last_trace_id = None
        assert langfuse_client.current_trace_id(handler) is None

    def test_disabled_langfuse_yields_none(self, monkeypatch):
        from qa_agent.config import settings

        monkeypatch.setattr(type(settings), "langfuse_enabled", property(lambda self: False))
        assert langfuse_client.current_trace_id() is None


class TestRecordScore:
    def test_a_score_is_posted_with_its_metadata(self):
        with patch("langfuse.get_client") as gc:
            client = MagicMock()
            gc.return_value = client
            assert langfuse_client.record_score(
                "trace-1", "data_query_coverage", 0.5, comment="1 of 2 queries", metadata={"kb": "kb1"}
            )
        client.create_score.assert_called_once()
        kwargs = client.create_score.call_args.kwargs
        assert kwargs["trace_id"] == "trace-1"
        assert kwargs["name"] == "data_query_coverage"
        assert kwargs["value"] == 0.5
        assert kwargs["comment"] == "1 of 2 queries"
        assert kwargs["metadata"] == {"kb": "kb1"}

    def test_without_a_trace_nothing_is_posted(self):
        with patch("langfuse.get_client") as gc:
            assert langfuse_client.record_score(None, "x", 1.0) is False
        gc.assert_not_called()

    def test_a_failing_score_never_raises(self):
        with patch("langfuse.get_client") as gc:
            gc.return_value.create_score.side_effect = RuntimeError("langfuse down")
            assert langfuse_client.record_score("t", "x", 1.0) is False

    def test_disabled_langfuse_posts_nothing(self, monkeypatch):
        from qa_agent.config import settings

        monkeypatch.setattr(type(settings), "langfuse_enabled", property(lambda self: False))
        with patch("langfuse.get_client") as gc:
            assert langfuse_client.record_score("t", "x", 1.0) is False
        gc.assert_not_called()
