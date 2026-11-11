"""Scores on the answer's trace: best effort, and never a failure."""
from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.services.workspace.evaluations import scores


@pytest.fixture(autouse=True)
def fresh_client_cache():
    """The client is a process-wide singleton now; a test that configured (or failed) one must not leak into the next."""
    scores._client_cache = None
    scores._client_unavailable = False
    yield
    scores._client_cache = None
    scores._client_unavailable = False


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setattr(settings, "langfuse_secret_key", "sk", raising=False)
    monkeypatch.setattr(settings, "langfuse_public_key", "pk", raising=False)
    monkeypatch.setattr(settings, "langfuse_base_url", "http://langfuse:3000", raising=False)


class TestScoreTrace:
    def test_unconfigured_langfuse_posts_nothing(self, monkeypatch):
        monkeypatch.setattr(settings, "langfuse_secret_key", None, raising=False)
        with patch("langfuse.Langfuse") as client:
            assert scores.score_trace("t", "x", 1.0) is False
        client.assert_not_called()

    def test_no_trace_posts_nothing(self, configured):
        with patch("langfuse.Langfuse") as client:
            assert scores.score_trace(None, "x", 1.0) is False
        client.assert_not_called()

    def test_a_score_carries_its_comment_and_metadata(self, configured):
        with patch("langfuse.Langfuse") as client:
            instance = MagicMock()
            client.return_value = instance
            assert scores.score_trace("t1", "data_query_pass", 0.0, comment="wrong table", metadata={"kb_id": "k"})
        kwargs = instance.create_score.call_args.kwargs
        assert kwargs["trace_id"] == "t1"
        assert kwargs["value"] == 0.0
        assert kwargs["comment"] == "wrong table"
        assert kwargs["metadata"] == {"kb_id": "k"}

    def test_a_langfuse_failure_does_not_raise(self, configured):
        with patch("langfuse.Langfuse") as client:
            client.return_value.create_score.side_effect = RuntimeError("down")
            assert scores.score_trace("t1", "x", 1.0) is False


class TestScoreDataQueryItem:
    def test_two_scores_per_verdict(self, configured):
        with patch("langfuse.Langfuse") as client:
            instance = MagicMock()
            client.return_value = instance
            wrote = scores.score_data_query_item("t1", passed=False, coverage=0.5, reasoning="1 of 2", kb_id="kb")
        names = [c.kwargs["name"] for c in instance.create_score.call_args_list]
        assert names == [scores.SCORE_DATA_QUERY_PASS, scores.SCORE_DATA_QUERY_COVERAGE]
        assert [c.kwargs["value"] for c in instance.create_score.call_args_list] == [0.0, 0.5]
        assert wrote == 2

    def test_one_client_serves_the_whole_run_and_is_flushed_once(self, configured):
        with patch("langfuse.Langfuse") as client:
            instance = MagicMock()
            client.return_value = instance
            for i in range(5):
                scores.score_data_query_item(f"t{i}", passed=True, coverage=1.0, reasoning="ok", kb_id="kb")
            assert client.call_count == 1              # not one client per score
            instance.flush.assert_not_called()         # batching is the point
            scores.flush_scores()
        instance.flush.assert_called_once()
