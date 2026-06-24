"""Tests for agent permission resolution."""

from __future__ import annotations

import pytest

from app.services.permissions.permission_resolution import jwt_payload_is_admin, resolve_agent_permission_keys


def test_jwt_payload_is_admin():
    assert jwt_payload_is_admin({"realm_access": {"roles": ["admin"]}}) is True
    assert jwt_payload_is_admin({"realm_access": {"roles": ["member"]}}) is False


@pytest.mark.asyncio
async def test_resolve_agent_permission_keys_admin():
    perms = await resolve_agent_permission_keys(
        None,  # type: ignore[arg-type]
        {"sub": "u1", "realm_access": {"roles": ["admin"]}},
    )
    assert perms == {"all"}


@pytest.mark.asyncio
async def test_resolve_agent_permission_keys_local_cli():
    perms = await resolve_agent_permission_keys(None, {"sub": "local-cli"})  # type: ignore[arg-type]
    assert perms == {"all"}
