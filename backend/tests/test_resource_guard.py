"""Tests for unified resource_guard and enforce_resource_acl."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.acl.resource_acl_constants import (
    PERM_READ,
    PERM_WRITE,
    RT_GLOSSARY,
    RT_OBJECT_TYPE,
)
from app.services.acl.resource_guard import (
    RESOURCE_REGISTRY,
    load_scoped_resource,
    resource_allowed,
)


def test_resource_registry_covers_standalone_types():
    assert RT_GLOSSARY in RESOURCE_REGISTRY
    assert RT_OBJECT_TYPE in RESOURCE_REGISTRY


def test_scope_skipped_when_scope_not_applies():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.acl.resource_guard.scope_applies", return_value=False):
            assert await resource_allowed(db, request, RT_GLOSSARY, "gl-1", PERM_READ) is True

    asyncio.run(_run())


def test_glossary_allowed_delegates_to_check_resource_access():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.acl.resource_guard.scope_applies", return_value=True):
            with patch(
                "app.services.acl.resource_guard.check_resource_access",
                new_callable=AsyncMock,
                return_value=False,
            ) as check:
                ok = await resource_allowed(db, request, RT_GLOSSARY, "gl-1", PERM_WRITE)
                assert ok is False
                check.assert_awaited_once_with(
                    db, {"sub": "user-a"}, "user-a", RT_GLOSSARY, "gl-1", PERM_WRITE
                )

    asyncio.run(_run())


def test_object_type_write_vs_read():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.acl.resource_guard.scope_applies", return_value=True):
            with patch(
                "app.services.acl.resource_guard.check_resource_access",
                new_callable=AsyncMock,
            ) as check:
                check.side_effect = [True, False]
                assert await resource_allowed(db, request, RT_OBJECT_TYPE, "ot-1", PERM_READ) is True
                assert await resource_allowed(db, request, RT_OBJECT_TYPE, "ot-1", PERM_WRITE) is False
                assert check.await_count == 2

    asyncio.run(_run())


def test_load_scoped_resource_not_found():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)

    async def _run():
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc:
            await load_scoped_resource(db, request, RT_GLOSSARY, "missing", PERM_READ)
        assert exc.value.status_code == 404

    asyncio.run(_run())


def test_acl_check_required_enforce_mode():
    from app.services.acl.resource_acl_service import acl_check_required

    db = AsyncMock()

    async def _run():
        with patch("app.config.settings.enforce_resource_acl", True):
            assert await acl_check_required(db, RT_GLOSSARY, "gl-1") is True

    asyncio.run(_run())


def test_check_resource_access_default_closed_without_acl():
    from app.services.acl.resource_acl_service import check_resource_access

    db = AsyncMock()
    payload = {"sub": "user-a"}

    async def _run():
        with patch("app.config.settings.enforce_resource_acl", True):
            with patch(
                "app.services.acl.acl_resolve.acl_check_required",
                new_callable=AsyncMock,
                return_value=True,
            ):
                with patch(
                    "app.services.acl.acl_resolve.effective_permissions",
                    new_callable=AsyncMock,
                    return_value=0,
                ):
                    ok = await check_resource_access(
                        db, payload, "user-a", RT_GLOSSARY, "gl-1", PERM_READ
                    )
                    assert ok is False

    asyncio.run(_run())
