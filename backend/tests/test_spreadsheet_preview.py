"""Tests for .xlsx preview helper."""

import io

import openpyxl
import pytest

from app.services.spreadsheet_preview import build_xlsx_preview


def _sample_xlsx_bytes() -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    assert ws is not None
    ws.title = "Data"
    ws.append(["Name", "Count"])
    ws.append(["Alpha", 1])
    ws.append(["Beta", 2])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_build_xlsx_preview_basic():
    raw = _sample_xlsx_bytes()
    preview, md = build_xlsx_preview(raw, file_hash="abc" * 10 + "ab")
    assert preview["document_kind"] == "spreadsheet"
    assert preview["file_hash"].startswith("abc")
    assert len(preview["sheets"]) >= 1
    sheet0 = preview["sheets"][0]
    assert sheet0["name"] == "Data"
    assert sheet0["rows"][0] == ["Name", "Count"]
    assert "Name" in md and "|" in md


def test_build_xlsx_preview_rejects_non_xlsx():
    with pytest.raises(Exception):
        build_xlsx_preview(b"not a zip", file_hash="x" * 64)
