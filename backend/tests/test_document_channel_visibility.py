"""Document access is gated by document channel ACL (no per-document rows)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.models.document import Document
from app.services.document_scope import load_document_scoped
from app.services.resource_acl_constants import PERM_READ, RT_DOCUMENT_CHANNEL
from app.services.resource_acl_service import document_visible_via_channel, scoped_document_predicate


def test_document_visible_denied_when_channel_not_readable():
    doc = Document(id="doc-1", channel_id="ch-restricted", name="secret.pdf")
    db = AsyncMock()

    async def _run():
        with patch("app.services.resource_acl_service.scope_applies", return_value=True):
            with patch(
                "app.services.resource_acl_service.check_resource_access",
                new_callable=AsyncMock,
                return_value=False,
            ) as check:
                ok = await document_visible_via_channel(
                    db, {"sub": "alice"}, "alice", doc
                )
                assert ok is False
                check.assert_awaited_once_with(
                    db,
                    {"sub": "alice"},
                    "alice",
                    RT_DOCUMENT_CHANNEL,
                    "ch-restricted",
                    PERM_READ,
                )

    asyncio.run(_run())


def test_document_visible_allowed_when_channel_readable():
    doc = Document(id="doc-1", channel_id="ch-open", name="ok.pdf")
    db = AsyncMock()

    async def _run():
        with patch("app.services.resource_acl_service.scope_applies", return_value=True):
            with patch(
                "app.services.resource_acl_service.check_resource_access",
                new_callable=AsyncMock,
                return_value=True,
            ):
                ok = await document_visible_via_channel(
                    db, {"sub": "alice"}, "alice", doc
                )
                assert ok is True

    asyncio.run(_run())


def test_load_document_scoped_returns_404_when_channel_denied():
    doc = Document(id="doc-1", channel_id="ch-restricted", name="secret.pdf")
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "alice"}
    db = AsyncMock()
    db.get = AsyncMock(return_value=doc)

    async def _run():
        with patch(
            "app.services.document_scope.document_visible_via_channel",
            new_callable=AsyncMock,
            return_value=False,
        ):
            with pytest.raises(HTTPException) as exc:
                await load_document_scoped(db, request, "doc-1")
            assert exc.value.status_code == 404

    asyncio.run(_run())


def test_scoped_document_predicate_uses_channel_ids_only():
    db = AsyncMock()

    async def _run():
        with patch(
            "app.services.resource_acl_service.readable_document_channel_ids",
            new_callable=AsyncMock,
            return_value={"ch-a", "ch-b"},
        ):
            pred = await scoped_document_predicate(db, {"sub": "alice"}, "alice")
            assert pred is not None
            compiled = str(pred.compile(compile_kwargs={"literal_binds": True}))
            assert "channel_id" in compiled

    asyncio.run(_run())
