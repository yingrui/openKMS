"""Key unit tests for article management (channels, import markdown rewrite, storage paths).

Integration with PostgreSQL / MinIO is covered separately; these assert stable service rules.
"""

from __future__ import annotations

import pytest

from app.services.article_service import collect_channel_and_descendants, rewrite_markdown_links
from app.services.article_storage import (
    article_bundle_prefix,
    article_object_key,
    is_allowed_article_file_path,
    safe_attachment_filename,
    safe_image_filename,
)


class _Ch:
    """Minimal stand-in for ArticleChannel (collect_channel_and_descendants only needs id + parent_id)."""

    __slots__ = ("id", "parent_id")

    def __init__(self, id: str, parent_id: str | None = None) -> None:
        self.id = id
        self.parent_id = parent_id


def test_collect_channel_and_descendants_root_only():
    out: set[str] = set()
    collect_channel_and_descendants([_Ch("root")], "root", out)
    assert out == {"root"}


def test_collect_channel_and_descendants_nested_tree():
    """Parent / child / grandchild: selecting parent includes whole subtree."""
    channels = [
        _Ch("news"),
        _Ch("news-eu", "news"),
        _Ch("news-eu-tech", "news-eu"),
        _Ch("other"),
    ]
    out: set[str] = set()
    collect_channel_and_descendants(channels, "news", out)
    assert out == {"news", "news-eu", "news-eu-tech"}


@pytest.mark.parametrize(
    ("md", "mapping", "expected"),
    [
        (None, {"a.png": "images/x.png"}, None),
        ("", {"a.png": "images/x.png"}, ""),
        ("no links here", {"x.png": "images/x.png"}, "no links here"),
        (
            "![chart](chart.png)",
            {"chart.png": "images/ab-chart.png"},
            "![chart](images/ab-chart.png)",
        ),
        (
            "See [report](report.pdf) and ![i](img/sub.png)",
            {"report.pdf": "attachments/report.pdf", "sub.png": "images/z-sub.png"},
            "See [report](attachments/report.pdf) and ![i](images/z-sub.png)",
        ),
        # Basename match only; path segments stripped to basename for lookup
        (
            "![](./assets/logo.PNG)",
            {"logo.png": "images/u-logo.png"},
            "![](images/u-logo.png)",
        ),
        # Absolute URL unchanged
        (
            "![remote](https://cdn.example/x.png)",
            {"x.png": "images/local.png"},
            "![remote](https://cdn.example/x.png)",
        ),
        # Anchor unchanged
        (
            "[toc](#section)",
            {"section": "images/x"},
            "[toc](#section)",
        ),
        # mailto unchanged
        (
            "[e](mailto:a@b.co)",
            {"a@b.co": "x"},
            "[e](mailto:a@b.co)",
        ),
        # Optional link title preserved
        (
            '[text](doc.pdf "My title")',
            {"doc.pdf": "attachments/doc.pdf"},
            '[text](attachments/doc.pdf "My title")',
        ),
    ],
)
def test_rewrite_markdown_links_import_behavior(md, mapping, expected):
    assert rewrite_markdown_links(md, mapping) == expected


def test_is_allowed_article_file_path_allowlist():
    assert is_allowed_article_file_path("content.md") is True
    assert is_allowed_article_file_path("origin.html") is True
    assert is_allowed_article_file_path("images/foo.png") is True
    assert is_allowed_article_file_path("attachments/a.pdf") is True


def test_is_allowed_article_file_path_rejects_traversal_and_empty():
    assert is_allowed_article_file_path("") is False
    assert is_allowed_article_file_path("../secrets") is False
    assert is_allowed_article_file_path("images/../content.md") is False
    assert is_allowed_article_file_path("evil.exe") is False


def test_safe_attachment_filename_sanitizes():
    assert safe_attachment_filename("  Report (Q1).pdf  ") == "Report (Q1).pdf"
    # Uses basename only; disallowed chars in the basename become underscores
    assert safe_attachment_filename("a/b\x00c.txt") == "b_c.txt"


def test_safe_image_filename_uses_content_type_when_no_extension():
    assert safe_image_filename(None, "image/png").endswith(".png")
    assert safe_image_filename("shot", "image/jpeg") == "shot.jpg"


def test_article_bundle_prefix_rejects_invalid_id():
    with pytest.raises(ValueError, match="Invalid article_id"):
        article_bundle_prefix("../x")
    with pytest.raises(ValueError, match="Invalid article_id"):
        article_bundle_prefix("ab/cd")


def test_article_object_key_rejects_traversal():
    with pytest.raises(ValueError, match="Invalid path"):
        article_object_key("id1", "../x")
    with pytest.raises(ValueError, match="Invalid path"):
        article_object_key("id1", "")
