"""Tests for job run worker log text builder."""

from app.services.jobs.job_run_worker_log import build_job_run_worker_log_text


def test_build_job_run_worker_log_text_no_truncation():
    text, truncated = build_job_run_worker_log_text("cmd -x", "out", "err", max_chars=10_000)
    assert truncated is False
    assert "--- command ---" in text
    assert "cmd -x" in text
    assert "--- stderr ---" in text
    assert "err" in text
    assert "--- stdout ---" in text
    assert "out" in text


def test_build_job_run_worker_log_text_truncates():
    long_out = "o" * 5000
    long_err = "e" * 5000
    text, truncated = build_job_run_worker_log_text(None, long_out, long_err, max_chars=200)
    assert truncated is True
    assert len(text) <= 200 + 50  # marker may add a few chars in edge cases
    assert "[truncated" in text


def test_build_job_run_worker_log_empty_streams():
    text, truncated = build_job_run_worker_log_text("", "", "", max_chars=500)
    assert truncated is False
    assert "(empty)" in text
