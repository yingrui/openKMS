"""Unit tests for lightweight document list responses."""

from datetime import datetime, timezone
from types import SimpleNamespace

from app.schemas.document import DocumentListItemResponse, DocumentResponse


def _document_stub():
    now = datetime.now(timezone.utc)
    return SimpleNamespace(
        id="doc-1",
        name="Sample.pdf",
        file_type="PDF",
        size_bytes=1234,
        channel_id="ch-1",
        file_hash="hash-1",
        status="completed",
        markdown="# Heavy markdown payload",
        parsing_result={"pages": [{"blocks": [1, 2, 3]}]},
        doc_metadata={"author": "Ada"},
        series_id="series-1",
        effective_from=None,
        effective_to=None,
        lifecycle_status=None,
        created_at=now,
        updated_at=now,
    )


def test_document_list_item_response_omits_heavy_fields():
    payload = DocumentListItemResponse.model_validate(_document_stub()).model_dump()

    assert payload["id"] == "doc-1"
    assert payload["status"] == "completed"
    assert payload["is_current_for_rag"] is True
    assert "markdown" not in payload
    assert "parsing_result" not in payload
    assert "metadata" not in payload


class _ListProjectionStub:
    def __init__(self) -> None:
        now = datetime.now(timezone.utc)
        self.id = "doc-2"
        self.name = "Projected.pdf"
        self.file_type = "PDF"
        self.size_bytes = 4321
        self.channel_id = "ch-2"
        self.file_hash = "hash-2"
        self.status = "completed"
        self.series_id = "series-2"
        self.effective_from = None
        self.effective_to = None
        self.lifecycle_status = None
        self.created_at = now
        self.updated_at = now

    @property
    def doc_metadata(self):
        raise AssertionError("list response should not touch unloaded doc_metadata")


def test_document_list_item_response_does_not_touch_doc_metadata():
    payload = DocumentListItemResponse.model_validate(_ListProjectionStub()).model_dump()

    assert payload["id"] == "doc-2"
    assert payload["name"] == "Projected.pdf"
    assert "metadata" not in payload


def test_document_detail_response_keeps_heavy_fields():
    payload = DocumentResponse.model_validate(_document_stub()).model_dump()

    assert payload["markdown"] == "# Heavy markdown payload"
    assert payload["parsing_result"] == {"pages": [{"blocks": [1, 2, 3]}]}
    assert payload["metadata"] == {"author": "Ada"}
