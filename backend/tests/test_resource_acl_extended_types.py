"""Tests for evaluation, glossary, and ontology type resource ACL."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.resource_acl_constants import (
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    RT_DATASET,
    RT_EVALUATION,
    RT_GLOSSARY,
    RT_LINK_TYPE,
    RT_OBJECT_TYPE,
    SECURABLE_RESOURCE_TYPES,
)
from app.services.glossary_scope import glossary_allowed
from app.services.ontology_type_scope import object_type_allowed


def test_glossary_in_securable_resource_types():
    assert RT_DATASET in SECURABLE_RESOURCE_TYPES
    assert RT_GLOSSARY in SECURABLE_RESOURCE_TYPES
    assert RT_EVALUATION in SECURABLE_RESOURCE_TYPES
    assert RT_OBJECT_TYPE in SECURABLE_RESOURCE_TYPES
    assert RT_LINK_TYPE in SECURABLE_RESOURCE_TYPES


def test_migration_seed_perm_rwm():
    assert (PERM_READ | PERM_WRITE | PERM_MANAGE) == 7


def test_scope_skipped_when_scope_not_applies():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.glossary_scope.scope_applies", return_value=False):
            assert await glossary_allowed(db, request, "gl-1", PERM_READ) is True

    asyncio.run(_run())


def test_glossary_allowed_delegates_to_check_resource_access():
    request = MagicMock()
    request.state.openkms_jwt_payload = {"sub": "user-a"}
    db = AsyncMock()

    async def _run():
        with patch("app.services.glossary_scope.scope_applies", return_value=True):
            with patch(
                "app.services.glossary_scope.check_resource_access",
                new_callable=AsyncMock,
                return_value=False,
            ) as check:
                ok = await glossary_allowed(db, request, "gl-1", PERM_WRITE)
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
        with patch("app.services.ontology_type_scope.scope_applies", return_value=True):
            with patch(
                "app.services.ontology_type_scope.check_resource_access",
                new_callable=AsyncMock,
            ) as check:
                check.side_effect = [True, False]
                assert await object_type_allowed(db, request, "ot-1", PERM_READ) is True
                assert await object_type_allowed(db, request, "ot-1", PERM_WRITE) is False
                assert check.await_count == 2

    asyncio.run(_run())
