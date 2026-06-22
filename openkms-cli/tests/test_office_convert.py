"""Tests for EPUB/Office conversion helpers."""

from pathlib import Path

from openkms_cli.office_convert import _mutool_epub_convert_cmd


def test_mutool_epub_convert_cmd_includes_compression_options() -> None:
    cmd = _mutool_epub_convert_cmd("/usr/bin/mutool", Path("/tmp/out.pdf"), Path("/tmp/book.epub"))
    assert cmd[0] == "/usr/bin/mutool"
    assert cmd[1] == "convert"
    opt_idx = cmd.index("-O")
    assert "compress-images" in cmd[opt_idx + 1]
    assert "compress=flate" in cmd[opt_idx + 1]
