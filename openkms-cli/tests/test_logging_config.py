"""Tests for CLI logging setup."""

import logging

from openkms_cli.logging_config import configure_cli_logging


def test_configure_cli_logging_stderr_handler(capsys):
    configure_cli_logging(level="INFO")
    log = logging.getLogger("openkms_cli.baidu")
    log.info("hello worker")
    captured = capsys.readouterr()
    assert "hello worker" in captured.err
    assert "INFO" in captured.err
    assert captured.out == ""


def test_configure_cli_logging_idempotent():
    configure_cli_logging(level="DEBUG")
    pkg = logging.getLogger("openkms_cli")
    n_handlers = len(pkg.handlers)
    configure_cli_logging(level="INFO")
    assert len(logging.getLogger("openkms_cli").handlers) == n_handlers
