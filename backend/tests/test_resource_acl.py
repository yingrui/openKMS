"""Tests for resource ACL permission helpers."""

import asyncio

from app.config import settings
from app.services.identity.acl.acl_identity import (
    _add_owner_candidate,
    _pick_richer_owner_label,
    normalize_owner_grantee_id,
    normalize_user_grantee_id,
    resolve_subject_display,
    subject_aliases,
    user_grant_matches,
)
from app.services.identity.acl.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, perm_satisfies, parse_perm_string
from app.services.identity.acl.resource_acl_service import _authenticated_bits_from_chain


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


def test_resolve_subject_display_maps_oidc_sub_via_user_row(monkeypatch):
    from unittest.mock import AsyncMock, MagicMock

    from app.models.user import User

    oidc_sub = "c539b559-96c5-4611-a499-966fea88fbae"
    user = MagicMock(spec=User)
    user.id = "cb8f2d42-local"
    user.username = "bob"
    user.email = "bob@example.com"

    async def fake_get(model, key):
        if model is User and key == oidc_sub:
            return None
        return None

    async def fake_execute(stmt):
        r = MagicMock()
        r.first.return_value = None
        r.scalar_one_or_none.return_value = user
        return r

    async def fake_directory_label(_db, _sub):
        return None

    db = AsyncMock()
    db.get = fake_get
    db.execute = fake_execute
    monkeypatch.setattr(settings, "auth_mode", "oidc")
    monkeypatch.setattr(
        "app.services.identity.users.oidc_identity_service.display_label_for_oidc_sub",
        fake_directory_label,
    )

    async def _run():
        label = await resolve_subject_display(db, oidc_sub)
        assert label == "bob"

    asyncio.run(_run())


def test_resolve_subject_display_prefers_hint():
    label = asyncio.run(
        resolve_subject_display(None, "11dcdd51-b251-4a69-9288-05ab2952be38", display_hint="yingrui")
    )
    assert label == "yingrui"


def test_user_grant_matches_username_alias():
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
    monkeypatch.setattr(settings, "auth_mode", "oidc")

    async def _run():
        as_self = await normalize_user_grantee_id(
            db,
            local_id,
            {"sub": oidc_sub, "preferred_username": "yingrui"},
        )
        assert as_self == oidc_sub

        async def fake_oidc_sub(_db, _user):
            return oidc_sub

        monkeypatch.setattr(
            "app.services.identity.acl.acl_identity._oidc_sub_for_user_row",
            fake_oidc_sub,
        )
        as_admin = await normalize_user_grantee_id(db, local_id, None)
        assert as_admin == oidc_sub

    asyncio.run(_run())


def test_pick_richer_owner_label_prefers_email():
    assert _pick_richer_owner_label("yingrui", "yingrui (yingrui.f@gmail.com)") == "yingrui (yingrui.f@gmail.com)"
    assert _pick_richer_owner_label("yingrui (a@b.com)", "yingrui") == "yingrui (a@b.com)"


def test_normalize_owner_grantee_id_keeps_unresolved_username(monkeypatch):
    from unittest.mock import AsyncMock

    db = AsyncMock()

    async def fake_normalize(_db, raw, _payload=None):
        return raw

    monkeypatch.setattr(
        "app.services.identity.acl.acl_identity.normalize_user_grantee_id",
        fake_normalize,
    )

    async def _run():
        out = await normalize_owner_grantee_id(db, "bob", None)
        assert out == "bob"

    asyncio.run(_run())


def test_normalize_owner_grantee_id_accepts_uuid(monkeypatch):
    from unittest.mock import AsyncMock

    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    db = AsyncMock()

    async def fake_normalize(_db, raw, _payload=None):
        return raw

    monkeypatch.setattr(settings, "auth_mode", "oidc")
    monkeypatch.setattr(
        "app.services.identity.acl.acl_identity.normalize_user_grantee_id",
        fake_normalize,
    )

    async def _run():
        out = await normalize_owner_grantee_id(db, oidc_sub, None)
        assert out == oidc_sub

    asyncio.run(_run())


def test_canonicalize_group_member_subjects_dedupes(monkeypatch):
    from unittest.mock import AsyncMock

    from app.services.identity.acl.acl_identity import canonicalize_group_member_subjects

    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    db = AsyncMock()

    async def fake_normalize(_db, raw, _payload=None):
        if raw in ("yingrui", oidc_sub):
            return oidc_sub
        return raw

    monkeypatch.setattr(
        "app.services.identity.acl.acl_identity.normalize_user_grantee_id",
        fake_normalize,
    )

    async def _run():
        out = await canonicalize_group_member_subjects(db, ["yingrui", oidc_sub, "  ", "bob"])
        assert out == [oidc_sub, "bob"]

    asyncio.run(_run())


def test_add_owner_candidate_merges_aliases_to_canonical(monkeypatch):
    """Username and OIDC sub normalize to one map entry with the richer label."""
    from unittest.mock import AsyncMock

    oidc_sub = "11dcdd51-b251-4a69-9288-05ab2952be38"
    db = AsyncMock()

    async def fake_normalize(_db, raw, _payload=None):
        if raw in (oidc_sub, "yingrui", "cb8f2d42-local"):
            return oidc_sub
        return raw

    monkeypatch.setattr(
        "app.services.identity.acl.acl_identity.normalize_user_grantee_id",
        fake_normalize,
    )

    async def _run():
        merged: dict[str, str] = {}
        await _add_owner_candidate(db, merged, "yingrui", "yingrui")
        await _add_owner_candidate(
            db,
            merged,
            oidc_sub,
            "yingrui (yingrui.f@gmail.com)",
        )
        assert list(merged.keys()) == [oidc_sub]
        assert merged[oidc_sub] == "yingrui (yingrui.f@gmail.com)"

    asyncio.run(_run())


def test_user_grant_matches_local_user_id_for_oidc_subject():
    """Owner ACL stored as legacy local users.id must match OIDC sub via username/email."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.user import User

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



def test_data_resource_normalization_strips_write_and_keeps_manage():
    """The rule the handler applies to a data resource: no `w`, `r`/`m` survive.

    Exercised as a pure function because the order matters and is easy to get wrong: the owner
    row bootstrap wrote as `rwm` must be normalized **after** it is ensured, or it slips through.
    """
    from app.api.resource_acl import _normalize_data_resource_grants

    parsed = [
        {"grantee_type": "user", "grantee_id": "owner", "permissions": 1 | 2 | 4},
        {"grantee_type": "group", "grantee_id": "g1", "permissions": 1 | 2},
    ]
    out = _normalize_data_resource_grants(parsed)
    assert [g["permissions"] for g in out] == [1 | 4, 1]


def test_data_resource_normalization_drops_a_grant_that_only_had_write():
    """`w` alone means nothing here, so the row disappears rather than becoming an empty grant."""
    from app.api.resource_acl import _normalize_data_resource_grants

    out = _normalize_data_resource_grants(
        [{"grantee_type": "user", "grantee_id": "u1", "permissions": 2}]
    )
    assert out == []


def _reader_check(db, resource, siblings, conflicts, parsed):
    """Drive `_reject_cross_resource_reader_grants` with canned db query results."""
    from unittest.mock import AsyncMock, MagicMock

    from app.api.resource_acl import _reject_cross_resource_reader_grants

    siblings_result = MagicMock()
    siblings_result.scalars.return_value.all.return_value = siblings
    conflicts_result = MagicMock()
    conflicts_result.scalars.return_value.all.return_value = conflicts

    db.get = AsyncMock(return_value=resource)
    db.execute = AsyncMock(side_effect=[siblings_result, conflicts_result])
    return _reject_cross_resource_reader_grants(db, resource.id, parsed)


def test_cross_resource_reader_grant_is_rejected(monkeypatch):
    """A second read grant on the same model is refused, naming the conflicting resource."""
    from unittest.mock import AsyncMock, MagicMock

    import pytest
    from fastapi import HTTPException

    from app.models.data_resource import DataResource
    from app.models.resource_acl import ResourceAclEntry

    resource = MagicMock(spec=DataResource)
    resource.id = "res-a"
    resource.semantic_model_id = "model-1"

    sibling = MagicMock(spec=DataResource)
    sibling.id = "res-b"
    sibling.name = "Full access"

    conflict = MagicMock(spec=ResourceAclEntry)
    conflict.resource_id = "res-b"
    conflict.grantee_id = "user-1"
    conflict.permissions = PERM_READ

    async def fake_display(_db, subject):
        return "bob"

    monkeypatch.setattr("app.api.resource_acl.resolve_subject_display", fake_display)

    parsed = [{"grantee_type": "user", "grantee_id": "user-1", "permissions": PERM_READ}]

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(_reader_check(AsyncMock(), resource, [sibling], [conflict], parsed))

    assert excinfo.value.status_code == 400
    assert "Full access" in excinfo.value.detail


def test_cross_resource_reader_grant_allows_a_first_grant(monkeypatch):
    """No conflicting entry on a sibling resource → the grant goes through."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.data_resource import DataResource

    resource = MagicMock(spec=DataResource)
    resource.id = "res-a"
    resource.semantic_model_id = "model-1"

    sibling = MagicMock(spec=DataResource)
    sibling.id = "res-b"
    sibling.name = "Full access"

    parsed = [{"grantee_type": "user", "grantee_id": "user-1", "permissions": PERM_READ}]
    asyncio.run(_reader_check(AsyncMock(), resource, [sibling], [], parsed))


def test_cross_resource_reader_grant_ignores_a_manager_on_a_sibling():
    """A manager (`rm`) on a sibling is administration, not a row scope, so it does not block."""
    from unittest.mock import AsyncMock, MagicMock

    from app.models.data_resource import DataResource
    from app.models.resource_acl import ResourceAclEntry

    resource = MagicMock(spec=DataResource)
    resource.id = "res-a"
    resource.semantic_model_id = "model-1"

    sibling = MagicMock(spec=DataResource)
    sibling.id = "res-b"
    sibling.name = "Full access"

    conflict = MagicMock(spec=ResourceAclEntry)
    conflict.resource_id = "res-b"
    conflict.grantee_id = "user-1"
    conflict.permissions = PERM_READ | PERM_MANAGE

    parsed = [{"grantee_type": "user", "grantee_id": "user-1", "permissions": PERM_READ}]
    asyncio.run(_reader_check(AsyncMock(), resource, [sibling], [conflict], parsed))
