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


def test_document_detail_response_keeps_heavy_fields():
    payload = DocumentResponse.model_validate(_document_stub()).model_dump()

    assert payload["markdown"] == "# Heavy markdown payload"
    assert payload["parsing_result"] == {"pages": [{"blocks": [1, 2, 3]}]}
    assert payload["metadata"] == {"author": "Ada"}
