"""Tests for context_guard (channel registry)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.context_guard import (
    CONTEXT_CHANNEL_REGISTRY,
    CONTEXT_LEAF_REGISTRY,
    context_resource_allowed,
    require_channel_in_scope,
)
from app.services.resource_acl_constants import (
    PERM_READ,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
    RT_WIKI_PAGE,
)


def test_context_registries():
    assert RT_WIKI_PAGE in CONTEXT_LEAF_REGISTRY
    assert RT_DOCUMENT_CHANNEL in CONTEXT_CHANNEL_REGISTRY
    assert RT_ARTICLE_CHANNEL in CONTEXT_CHANNEL_REGISTRY


def test_require_channel_in_scope_denies_unknown():
    with pytest.raises(HTTPException) as exc:
        require_channel_in_scope({"ch-1"}, "ch-2")
    assert exc.value.status_code == 404


def test_context_read_delegates_to_check_for_channels():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.context_guard.scope_applies", return_value=True):
            with patch(
                "app.services.context_guard.check_resource_access",
                new_callable=AsyncMock,
                return_value=True,
            ) as check:
                ok = await context_resource_allowed(
                    db, request, RT_ARTICLE_CHANNEL, "ch-1", PERM_READ
                )
                assert ok is True
                check.assert_awaited_once()

    asyncio.run(_run())
