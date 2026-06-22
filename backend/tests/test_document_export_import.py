"""Tests for document parsing export/import and chunked upload endpoints."""
import io
import json
import zipfile
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.document import Document
from app.constants import DocumentStatus


_HASH = "a" * 64
_DOC_ID = "doc-123"


def _make_doc() -> Document:
    now = datetime.now(timezone.utc)
    return Document(
        id=_DOC_ID,
        name="test-doc.pdf",
        file_type="PDF",
        size_bytes=1024,
        channel_id="ch-1",
        file_hash=_HASH,
        status=DocumentStatus.UPLOADED,
        series_id=_DOC_ID,
        created_at=now,
        updated_at=now,
    )


def _make_zip_bytes(files: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, data)
    buf.seek(0)
    return buf.read()


class TestProcessImportZip:
    """Tests for _process_import_zip helper."""

    def test_uploads_files_and_updates_doc(self):
        from app.api.documents import _process_import_zip

        doc = _make_doc()
        db = AsyncMock()
        raw = _make_zip_bytes({
            "markdown.md": b"# Hello\nWorld",
            "result.json": json.dumps({"page_count": 1}).encode(),
        })

        with patch("app.api.documents.upload_object") as mock_upload:
            with patch("app.api.documents._maybe_upload_page_index_from_markdown"):
                result_doc = _make_doc()
                result_doc.markdown = "# Hello\nWorld"
                result_doc.parsing_result = {"page_count": 1}
                result_doc.status = DocumentStatus.COMPLETED
                db.refresh = AsyncMock()

                doc = _make_doc()
                doc.markdown = None
                doc.parsing_result = None

                # We need to run the coroutine
                import asyncio
                updated = asyncio.run(_process_import_zip(db, doc, raw))

        assert mock_upload.call_count == 2
        upload_keys = [call.args[0] for call in mock_upload.call_args_list if call.args]
        assert any("markdown.md" in k for k in upload_keys)
        assert any("result.json" in k for k in upload_keys)
        assert updated.markdown == "# Hello\nWorld"
        assert updated.parsing_result == {"page_count": 1}
        assert updated.status == DocumentStatus.COMPLETED
        db.commit.assert_called_once()

    def test_invalid_zip_raises_400(self):
        from app.api.documents import _process_import_zip
        from fastapi import HTTPException

        doc = _make_doc()
        db = AsyncMock()

        import asyncio
        with pytest.raises(HTTPException, match="Invalid zip"):
            asyncio.run(_process_import_zip(db, doc, b"not a zip file"))

    def test_empty_zip_raises_400(self):
        from app.api.documents import _process_import_zip
        from fastapi import HTTPException

        doc = _make_doc()
        db = AsyncMock()
        raw = _make_zip_bytes({})  # empty

        import asyncio
        with pytest.raises(HTTPException, match="Zip archive is empty"):
            asyncio.run(_process_import_zip(db, doc, raw))

    def test_markdown_decode_fallback(self):
        from app.api.documents import _process_import_zip

        doc = _make_doc()
        db = AsyncMock()
        raw = _make_zip_bytes({
            "markdown.md": b"\xff\xfe invalid utf8",
            "result.json": b"not json",
        })

        with patch("app.api.documents.upload_object"):
            with patch("app.api.documents._maybe_upload_page_index_from_markdown"):
                import asyncio
                updated = asyncio.run(_process_import_zip(db, doc, raw))

        # Should not crash on bad encoding or bad json
        assert updated.markdown is None  # decode failed
        assert updated.parsing_result is None  # json parse failed
        assert updated.status == DocumentStatus.COMPLETED


class TestExportEndpoint:
    """Tests for export_document_parsing endpoint function."""

    def test_returns_zip_with_stored_objects(self):
        from app.api.documents import export_document_parsing
        from app.services.storage import StorageObjectInfo

        doc = _make_doc()
        doc.markdown = "# test"
        doc.parsing_result = {"page_count": 1}

        keys = [
            f"documents/{_HASH}/original.pdf",
            f"documents/{_HASH}/markdown.md",
            f"documents/{_HASH}/result.json",
        ]
        s3_objects = {
            keys[0]: b"fake-pdf-content",
            keys[1]: b"# Markdown",
            keys[2]: json.dumps({"x": 1}).encode(),
        }

        with patch("app.api.documents.iter_object_keys", return_value=keys):
            with patch("app.api.documents.get_object", side_effect=lambda k: s3_objects[k]):
                with patch("app.api.documents.settings") as mock_settings:
                    mock_settings.storage_enabled = True
                    import asyncio
                    resp = asyncio.run(export_document_parsing(_DOC_ID, doc))

        assert resp.media_type == "application/zip"
        cd = resp.headers.get("content-disposition", "")
        assert "test-doc.pdf-parsing.zip" in cd

        # Verify zip contents
        import anyio
        body = b""
        async def _read():
            nonlocal body
            async for chunk in resp.body_iterator:
                body += chunk

        asyncio.run(_read())
        with zipfile.ZipFile(io.BytesIO(body), "r") as zf:
            names = zf.namelist()
            assert "original.pdf" in names
            assert "markdown.md" in names
            assert "result.json" in names
            assert zf.read("markdown.md") == b"# Markdown"

    def test_no_file_hash_raises_400(self):
        from app.api.documents import export_document_parsing
        from fastapi import HTTPException

        doc = _make_doc()
        doc.file_hash = None

        import asyncio
        with pytest.raises(HTTPException, match="no stored files"):
            asyncio.run(export_document_parsing(_DOC_ID, doc))

    def test_no_objects_raises_404(self):
        from app.api.documents import export_document_parsing
        from fastapi import HTTPException

        doc = _make_doc()

        with patch("app.api.documents.iter_object_keys", return_value=[]):
            with patch("app.api.documents.settings") as mock_settings:
                mock_settings.storage_enabled = True
                import asyncio
                with pytest.raises(HTTPException, match="No stored files"):
                    asyncio.run(export_document_parsing(_DOC_ID, doc))

    def test_safe_filename_handles_special_chars(self):
        from app.api.documents import export_document_parsing

        doc = _make_doc()
        doc.name = "my/report:2025?.pdf"

        keys = [f"documents/{_HASH}/markdown.md"]
        with patch("app.api.documents.iter_object_keys", return_value=keys):
            with patch("app.api.documents.get_object", return_value=b"# hi"):
                with patch("app.api.documents.settings") as mock_settings:
                    mock_settings.storage_enabled = True
                    import asyncio
                    resp = asyncio.run(export_document_parsing(_DOC_ID, doc))

        cd = resp.headers.get("content-disposition", "")
        assert "my_report_2025_.pdf-parsing.zip" in cd


class TestImportChunkedEndpoint:
    """Tests for import_document_parsing_chunked endpoint function."""

    def test_stores_chunks_and_reassembles(self):
        from app.api.documents import import_document_parsing_chunked
        from fastapi import UploadFile

        doc = _make_doc()
        db = AsyncMock()

        zip_data = _make_zip_bytes({"markdown.md": b"# Restored"})

        chunk_size = len(zip_data) // 3 + 1
        chunks = [
            zip_data[i : i + chunk_size] for i in range(0, len(zip_data), chunk_size)
        ]
        total = len(chunks)

        import asyncio

        with patch("app.api.documents.settings") as mock_settings:
            mock_settings.storage_enabled = True
            with patch("app.api.documents.upload_object"):
                with patch(
                    "app.api.documents._maybe_upload_page_index_from_markdown"
                ):
                    # Upload all chunks; only the last one processes
                    for idx, chunk in enumerate(chunks):
                        archive = UploadFile(
                            filename=f"chunk{idx}",
                            file=io.BytesIO(chunk),
                        )
                        resp = asyncio.run(
                            import_document_parsing_chunked(
                                _DOC_ID,
                                archive=archive,
                                chunk_index=idx,
                                total_chunks=total,
                                db=db,
                                doc=doc,
                            )
                        )
                        if idx == total - 1:
                            # Last chunk should return a DocumentResponse
                            assert resp is not None
                            assert resp.markdown == "# Restored"
                            assert resp.status == DocumentStatus.COMPLETED

        # Verify cleanup happened (temp dir should be gone after reassemble)
        import os
        import tempfile
        tmp = os.path.join(tempfile.gettempdir(), "openkms-chunks", _DOC_ID)
        assert not os.path.exists(tmp)

    def test_invalid_chunk_index_raises_400(self):
        from app.api.documents import import_document_parsing_chunked
        from fastapi import HTTPException, UploadFile
        import asyncio

        doc = _make_doc()
        db = AsyncMock()

        archive = UploadFile(filename="c0", file=io.BytesIO(b"x"))
        with patch("app.api.documents.settings") as mock_settings:
            mock_settings.storage_enabled = True
            with pytest.raises(HTTPException, match="Invalid chunk_index"):
                asyncio.run(
                    import_document_parsing_chunked(
                        _DOC_ID,
                        archive=archive,
                        chunk_index=5,
                        total_chunks=3,
                        db=db,
                        doc=doc,
                    )
                )


class TestUploadChunkedEndpoint:
    """Tests for upload_document_chunked endpoint function."""

    def test_empty_chunk_raises_400(self):
        from app.api.documents import upload_document_chunked
        from fastapi import HTTPException, Request, UploadFile
        import asyncio

        db = AsyncMock()
        request = MagicMock(spec=Request)
        request.state.openkms_jwt_payload = {"sub": "user1"}

        with patch("app.api.documents.settings") as mock_settings:
            mock_settings.storage_enabled = True
            with patch("app.api.documents.scope_applies", return_value=False):
                with patch("app.api.documents.DocumentChannel") as mock_ch:
                    mock_ch.return_value = None
                    db.get = AsyncMock(return_value=MagicMock())

                    archive = UploadFile(filename="empty", file=io.BytesIO(b""))
                    with pytest.raises(HTTPException, match="Empty chunk"):
                        asyncio.run(
                            upload_document_chunked(
                                request=request,
                                file_chunk=archive,
                                chunk_index=0,
                                total_chunks=1,
                                channel_id="ch-1",
                                filename="test.pdf",
                                db=db,
                            )
                        )
