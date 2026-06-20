"""Article access is gated by article channel ACL (no per-article rows)."""

import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException

from app.models.article import Article
from app.services.article_scope import load_article_scoped, require_article_by_id_read
from app.services.resource_acl_constants import PERM_READ, RT_ARTICLE_CHANNEL
from app.services.resource_acl_service import article_visible_via_channel, scoped_article_predicate


def test_article_visible_denied_when_channel_not_readable():
    row = Article(id="art-1", channel_id="ch-restricted", name="Draft")
    db = AsyncMock()

    async def _run():
        with patch("app.services.acl_content_visibility.scope_applies", return_value=True):
            with patch(
                "app.services.acl_content_visibility.check_resource_access",
                new_callable=AsyncMock,
                return_value=False,
            ) as check:
                ok = await article_visible_via_channel(
                    db, {"sub": "alice"}, "alice", row
                )
                assert ok is False
                check.assert_awaited_once_with(
                    db,
                    {"sub": "alice"},
                    "alice",
                    RT_ARTICLE_CHANNEL,
                    "ch-restricted",
                    PERM_READ,
                )

    asyncio.run(_run())


def test_load_article_scoped_returns_404_when_channel_denied():
    row = Article(id="art-1", channel_id="ch-restricted", name="Draft")
    request = AsyncMock()
    request.state.openkms_jwt_payload = {"sub": "alice"}
    db = AsyncMock()
    db.get = AsyncMock(return_value=row)

    async def _run():
        with patch(
            "app.services.article_scope.article_visible_via_channel",
            new_callable=AsyncMock,
            return_value=False,
        ):
            with pytest.raises(HTTPException) as exc:
                await load_article_scoped(db, request, "art-1")
            assert exc.value.status_code == 404

    asyncio.run(_run())


def test_scoped_article_predicate_uses_channel_ids_only():
    db = AsyncMock()

    async def _run():
        with patch(
            "app.services.acl_content_visibility.readable_article_channel_ids",
            new_callable=AsyncMock,
            return_value={"ch-a"},
        ):
            pred = await scoped_article_predicate(db, {"sub": "alice"}, "alice")
            assert pred is not None
            compiled = str(pred.compile(compile_kwargs={"literal_binds": True}))
            assert "channel_id" in compiled

    asyncio.run(_run())
