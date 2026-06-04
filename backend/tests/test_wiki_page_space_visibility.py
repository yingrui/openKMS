"""Wiki page access is gated by wiki space ACL (no per-page sharing)."""

import asyncio
from unittest.mock import AsyncMock, patch

from app.models.wiki_models import WikiPage
from app.services.resource_acl_constants import PERM_READ, RT_WIKI_SPACE
from app.services.resource_acl_service import wiki_page_visible_via_space


def test_wiki_page_visible_denied_when_space_not_readable():
    page = WikiPage(id="pg-1", wiki_space_id="ws-restricted", path="a", title="A")
    db = AsyncMock()

    async def _run():
        with patch("app.services.resource_acl_service.scope_applies", return_value=True):
            with patch(
                "app.services.resource_acl_service.check_resource_access",
                new_callable=AsyncMock,
                return_value=False,
            ) as check:
                ok = await wiki_page_visible_via_space(
                    db, {"sub": "alice"}, "alice", page
                )
                assert ok is False
                check.assert_awaited_once_with(
                    db,
                    {"sub": "alice"},
                    "alice",
                    RT_WIKI_SPACE,
                    "ws-restricted",
                    PERM_READ,
                )

    asyncio.run(_run())


def test_wiki_page_visible_denied_without_space_id():
    page = WikiPage(id="pg-1", wiki_space_id=None, path="a", title="A")
    db = AsyncMock()

    async def _run():
        with patch("app.services.resource_acl_service.scope_applies", return_value=True):
            ok = await wiki_page_visible_via_space(db, {"sub": "alice"}, "alice", page)
            assert ok is False

    asyncio.run(_run())
