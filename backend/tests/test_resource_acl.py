"""Tests for resource ACL permission helpers."""

from app.services.resource_acl_constants import PERM_MANAGE, PERM_READ, PERM_WRITE, perm_satisfies, parse_perm_string
from app.services.resource_acl_service import _authenticated_bits_from_chain, subject_aliases


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
