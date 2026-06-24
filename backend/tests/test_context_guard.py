"""Tests for context_guard (channel registry)."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from app.services.acl.context_guard import (
    CONTEXT_CHANNEL_REGISTRY,
    context_resource_allowed,
    require_channel_in_scope,
)
from app.services.acl.resource_acl_constants import (
    PERM_READ,
    RT_ARTICLE_CHANNEL,
    RT_DOCUMENT_CHANNEL,
)


def test_context_channel_registries():
    assert RT_DOCUMENT_CHANNEL in CONTEXT_CHANNEL_REGISTRY
    assert RT_ARTICLE_CHANNEL in CONTEXT_CHANNEL_REGISTRY


def test_require_channel_in_scope_denies_unknown():
    with pytest.raises(HTTPException) as exc:
        require_channel_in_scope({"ch-1"}, "ch-2")
    assert exc.value.status_code == 404


def test_context_read_delegates_to_resource_allowed():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch(
            "app.services.acl.context_guard.resource_allowed",
            new_callable=AsyncMock,
            return_value=True,
        ) as allowed:
            ok = await context_resource_allowed(
                db, request, RT_ARTICLE_CHANNEL, "ch-1", PERM_READ
            )
            assert ok is True
            allowed.assert_awaited_once()

    asyncio.run(_run())
