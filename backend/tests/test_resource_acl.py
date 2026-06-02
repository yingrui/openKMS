"""Tests for resource ACL permission helpers."""

import asyncio

from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, perm_satisfies, parse_perm_string
from app.services.resource_acl_service import _authenticated_bits_from_chain, resolve_subject_display, subject_aliases


def test_perm_satisfies_manage_implies_all():
    assert perm_satisfies(PERM_MANAGE, PERM_READ)
    assert perm_satisfies(PERM_MANAGE, PERM_WRITE)
    assert perm_satisfies(PERM_MANAGE, PERM_READ | PERM_WRITE)


def test_perm_satisfies_read_only():
    assert perm_satisfies(PERM_READ, PERM_READ)
    assert not perm_satisfies(PERM_READ, PERM_WRITE)


def test_parse_perm_string():
    assert parse_perm_string("rw") == (PERM_READ | PERM_WRITE)
    assert parse_perm_string("rwm") == (PERM_READ | PERM_WRITE | PERM_MANAGE)


class _FakeEntry:
    def __init__(
        self,
        resource_type: str,
        resource_id: str,
        grantee_type: str,
        permissions: int,
        grantee_id: str | None = None,
    ):
        self.resource_type = resource_type
        self.resource_id = resource_id
        self.grantee_type = grantee_type
        self.permissions = permissions
        self.grantee_id = grantee_id


def test_authenticated_bits_nearest_blocks_parent():
    chain = [("document_channel", "child"), ("document_channel", "parent")]
    entries = [
        _FakeEntry("document_channel", "child", "authenticated", 0),
        _FakeEntry("document_channel", "parent", "authenticated", PERM_READ | PERM_WRITE | PERM_MANAGE),
    ]
    assert _authenticated_bits_from_chain(chain, entries) == 0


def test_effective_access_denied_when_others_empty_and_not_in_group():
    """User with no group/owner grant and explicit Others deny gets no permissions."""
    chain = [("document_channel", "test")]
    entries = [
        _FakeEntry("document_channel", "test", "group", PERM_READ | PERM_WRITE | PERM_MANAGE, "qa-group"),
        _FakeEntry("document_channel", "test", "user", PERM_READ | PERM_WRITE | PERM_MANAGE, "bob"),
        _FakeEntry("document_channel", "test", "authenticated", 0),
    ]
    auth_bits = _authenticated_bits_from_chain(chain, entries)
    assert auth_bits == 0
    group_ids: set[str] = set()
    bits = auth_bits or 0
    for entry in entries:
        if entry.grantee_type == "authenticated":
            continue
        if entry.grantee_type == "group" and entry.grantee_id in group_ids:
            bits |= entry.permissions
        if entry.grantee_type == "user" and entry.grantee_id == "yingrui-sub":
            bits |= entry.permissions
    assert bits == 0
    assert not perm_satisfies(bits, PERM_READ)


def test_authenticated_bits_inherits_when_child_unset():
    chain = [("document_channel", "child"), ("document_channel", "parent")]
    entries = [
        _FakeEntry("document_channel", "parent", "authenticated", PERM_READ),
    ]
    assert _authenticated_bits_from_chain(chain, entries) == PERM_READ


def test_subject_aliases_includes_jwt_claims():
    aliases = subject_aliases(
        "uuid-sub",
        {"preferred_username": "bob", "email": "bob@example.com", "name": "Bob"},
    )
    assert aliases == {"uuid-sub", "bob", "bob@example.com", "Bob"}


def test_resolve_subject_display_prefers_hint():
    label = asyncio.run(
        resolve_subject_display(None, "11dcdd51-b251-4a69-9288-05ab2952be38", display_hint="yingrui")
    )
    assert label == "yingrui"


def test_user_grant_matches_username_alias():
    from app.services.resource_acl_service import user_grant_matches

    async def _run():
        matched = await user_grant_matches(
            None,
            "yingrui",
            "11dcdd51-b251-4a69-9288-05ab2952be38",
            {"sub": "11dcdd51-b251-4a69-9288-05ab2952be38", "preferred_username": "yingrui"},
        )
        assert matched is True

    asyncio.run(_run())


def test_normalize_user_grantee_id_maps_local_user_id_to_oidc_sub(monkeypatch):
    """Saving owner with legacy local users.id must store OIDC sub in OIDC mode."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.user import User
    from app.services import resource_acl_service as svc

    local_id = "cb8f2d42-1eb4-4b48-a82a-fdde0586aaa8"
    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    user = MagicMock(spec=User)
    user.id = local_id
    user.username = "yingrui"
    user.email = "yingrui.f@gmail.com"

    async def fake_get(model, key):
        if model is User and key == local_id:
            return user
        return None

    db = AsyncMock()
    db.get = fake_get
    monkeypatch.setattr(svc.settings, "auth_mode", "oidc")

    async def _run():
        as_self = await svc.normalize_user_grantee_id(
            db,
            local_id,
            {"sub": oidc_sub, "preferred_username": "yingrui"},
        )
        assert as_self == oidc_sub

        async def fake_oidc_sub(_db, _user):
            return oidc_sub

        monkeypatch.setattr(svc, "_oidc_sub_for_user_row", fake_oidc_sub)
        as_admin = await svc.normalize_user_grantee_id(db, local_id, None)
        assert as_admin == oidc_sub

    asyncio.run(_run())


def test_user_grant_matches_local_user_id_for_oidc_subject():
    """Owner ACL stored as legacy local users.id must match OIDC sub via username/email."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.user import User
    from app.services.resource_acl_service import user_grant_matches

    local_id = "cb8f2d42-1eb4-4b48-a82a-fdde0586aaa8"
    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    user = MagicMock(spec=User)
    user.id = local_id
    user.username = "yingrui"
    user.email = "yingrui.f@gmail.com"

    async def fake_get(model, key):
        if model is User and key == local_id:
            return user
        return None

    db = AsyncMock()
    db.get = fake_get

    async def _run():
        matched = await user_grant_matches(
            db,
            local_id,
            oidc_sub,
            {
                "sub": oidc_sub,
                "preferred_username": "yingrui",
                "email": "yingrui.f@gmail.com",
            },
        )
        assert matched is True

    asyncio.run(_run())
