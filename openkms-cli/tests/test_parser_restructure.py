"""Tests for Paddle page restructuring helper (no PaddleOCR import)."""

from __future__ import annotations

from unittest.mock import MagicMock

from openkms_cli.parser import _restructure_pages_after_predict


def test_restructure_single_page_pdf_uses_plain_restructure() -> None:
    pipeline = MagicMock()
    pipeline.restructure_pages.return_value = [{"ok": True}]
    out = _restructure_pages_after_predict([{"p": 0}], pipeline, ".pdf")
    assert out == [{"ok": True}]
    pipeline.restructure_pages.assert_called_once_with([{"p": 0}])


def test_restructure_multi_page_pdf_prefers_extended_kwargs() -> None:
    pipeline = MagicMock()
    pages = [{"a": 1}, {"b": 2}]
    pipeline.restructure_pages.return_value = ["merged"]
    out = _restructure_pages_after_predict(pages, pipeline, ".pdf")
    assert out == ["merged"]
    pipeline.restructure_pages.assert_called_once_with(
        pages,
        merge_tables=True,
        relevel_titles=True,
        concatenate_pages=True,
    )


def test_restructure_multi_page_pdf_typeerror_falls_back() -> None:
    pipeline = MagicMock()
    pages = [{"a": 1}, {"b": 2}]

    def side_effect(res, *args, **kwargs):
        if kwargs:
            raise TypeError("older paddle")
        return ["fallback"]

    pipeline.restructure_pages.side_effect = side_effect
    out = _restructure_pages_after_predict(pages, pipeline, ".pdf")
    assert out == ["fallback"]
    assert pipeline.restructure_pages.call_count == 2


def test_restructure_two_pages_non_pdf_single_call() -> None:
    pipeline = MagicMock()
    pages = [{"a": 1}, {"b": 2}]
    pipeline.restructure_pages.return_value = ["x"]
    out = _restructure_pages_after_predict(pages, pipeline, ".png")
    assert out == ["x"]
    pipeline.restructure_pages.assert_called_once_with(pages)
