"""Tests for .xmind outline preview helper."""

import io
import json
import zipfile

import pytest

from app.services.documents.mindmap_preview import MindmapPreviewError, build_xmind_preview


def _xmind_bytes(payload: dict | list) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("content.json", json.dumps(payload))
        zf.writestr("attachments/note.txt", b"hello")
    return buf.getvalue()


def test_build_xmind_preview_json_outline():
    raw = _xmind_bytes(
        [
            {
                "title": "Plan",
                "rootTopic": {
                    "title": "Root",
                    "notes": {"plain": {"content": "Root note"}},
                    "children": {
                        "attached": [
                            {
                                "title": "Child",
                                "labels": ["todo"],
                                "children": {"attached": [{"title": "Grandchild"}]},
                            }
                        ]
                    },
                },
            }
        ]
    )
    preview, md = build_xmind_preview(raw, file_hash="a" * 64)
    assert preview["document_kind"] == "mindmap"
    assert preview["format"] == "content.json"
    assert preview["sheets"][0]["name"] == "Plan"
    assert preview["sheets"][0]["topic_count"] == 3
    assert len(preview["attachments"]) == 1
    assert "# Plan" in md
    assert "- Child" in md
    assert "> Root note" in md
    assert "Attachments" in md


def test_build_xmind_preview_rejects_non_archive():
    with pytest.raises(MindmapPreviewError):
        build_xmind_preview(b"not a zip", file_hash="b" * 64)


def test_build_xmind_preview_rejects_missing_content():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("metadata.json", "{}")
    with pytest.raises(MindmapPreviewError):
        build_xmind_preview(buf.getvalue(), file_hash="c" * 64)
