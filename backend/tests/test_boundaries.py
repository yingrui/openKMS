"""The blanket-catch boundary is the one place BLE001 is turned off — lock its behaviour."""

from __future__ import annotations

import logging

import pytest

from app.services.boundaries import boundary


def test_success_reports_no_failure() -> None:
    with boundary("do a thing") as failed:
        value = 1 + 1
    assert failed == []
    assert value == 2


def test_failure_is_collected_not_raised() -> None:
    with boundary("do a thing") as failed:
        raise RuntimeError("boom")
    assert len(failed) == 1
    assert str(failed[0]) == "boom"


def test_failure_is_logged_with_the_boundary_name(caplog: pytest.LogCaptureFixture) -> None:
    logger = logging.getLogger("test.boundaries")
    with caplog.at_level(logging.WARNING, logger="test.boundaries"):
        with boundary("publish the audit event", logger=logger):
            raise ValueError("nope")
    assert "publish the audit event" in caplog.text
    assert "nope" in caplog.text


def test_reraise_lets_a_control_flow_error_through() -> None:
    with pytest.raises(KeyError):
        with boundary("run the evaluation", reraise=(KeyError,)):
            raise KeyError("still mine")


def test_cancellation_is_never_swallowed() -> None:
    """`except Exception` must not catch BaseException: closing a stream has to work."""
    with pytest.raises(GeneratorExit):
        with boundary("stream a response"):
            raise GeneratorExit
