"""Document/article write requires channel write ACL."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.document import Document
from app.services.document_scope import load_document_scoped, require_document_write
from app.services.resource_acl_constants import PERM_READ, PERM_WRITE, RT_DOCUMENT_CHANNEL


def test_null_channel_id_denied_on_read():
    doc = Document(id="doc-orphan", channel_id=None, name="orphan.pdf")
    db = AsyncMock()

    async def _run():
        with patch("app.services.resource_acl_service.scope_applies", return_value=True):
            ok = await __import__(
                "app.services.resource_acl_service", fromlist=["document_visible_via_channel"]
            ).document_visible_via_channel(db, {"sub": "alice"}, "alice", doc)
            assert ok is False

    asyncio.run(_run())


def test_require_document_write_denied_without_channel_write():
    doc = Document(id="doc-1", channel_id="ch-readonly", name="x.pdf")
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "alice"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.document_scope.scope_applies", return_value=True):
            with patch(
                "app.services.document_scope.channel_allowed_for_document_upload",
                new_callable=AsyncMock,
                return_value=False,
            ):
                with pytest.raises(HTTPException) as exc:
                    await require_document_write(db, request, doc)
                assert exc.value.status_code == 404

    asyncio.run(_run())


def test_require_document_write_allows_local_cli_without_channel_acl():
    """local-cli has scope_applies false; public /api write skips channel ACL check."""
    doc = Document(id="doc-1", channel_id="ch-readonly", name="x.pdf")
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "local-cli"}
    db = AsyncMock()

    async def _run():
        with patch(
            "app.services.document_scope.channel_allowed_for_document_upload",
            new_callable=AsyncMock,
            return_value=False,
        ) as upload_check:
            out = await require_document_write(db, request, doc)
            assert out is doc
            upload_check.assert_not_awaited()

    asyncio.run(_run())


def test_load_document_scoped_write_checks_write_bit():
    doc = Document(id="doc-1", channel_id="ch-a", name="x.pdf")
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "alice"}
    db = AsyncMock()
    db.get = AsyncMock(return_value=doc)

    async def _run():
        with patch(
            "app.services.document_scope.require_document_write",
            new_callable=AsyncMock,
            return_value=doc,
        ) as write_check:
            row = await load_document_scoped(db, request, "doc-1", PERM_WRITE)
            assert row is doc
            write_check.assert_awaited_once()

        with patch(
            "app.services.document_scope.require_document_read",
            new_callable=AsyncMock,
            return_value=doc,
        ) as read_check:
            row = await load_document_scoped(db, request, "doc-1", PERM_READ)
            assert row is doc
            read_check.assert_awaited_once()

    asyncio.run(_run())
