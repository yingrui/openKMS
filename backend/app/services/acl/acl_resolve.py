"""ACL permission resolution and access checks."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.resource_acl import ResourceAclEntry
from app.services.acl.acl_context import (
    _acl_entries_for_resources,
    acl_check_required,
    resource_context_chain,
)
from app.services.acl.acl_identity import subject_aliases, user_grant_matches, user_group_ids
from app.services.acl.acl_scope import _acl_subject, jwt_is_admin
from app.services.acl.resource_acl_constants import (
    GRANTEE_AUTHENTICATED,
    GRANTEE_GROUP,
    GRANTEE_USER,
    PERM_MANAGE,
    perm_satisfies,
)

async def _effective_permissions_from_entries(
    db: AsyncSession,
    subject: str,
    chain: list[tuple[str, str]],
    entries: list[ResourceAclEntry],
    payload: dict | None = None,
) -> int:
    """In-memory effective bits for a pre-loaded entry set (standalone resources)."""
    group_ids = set(await user_group_ids(db, subject, payload))
    alias_set = subject_aliases(subject, payload)
    if settings.auth_mode == "local":
        from app.models.user import User

        user = await db.get(User, subject)
        if user:
            alias_set.add(str(user.id))
            alias_set.add(user.username)
            alias_set.add(user.username.lower())
    bits = 0
    auth_bits = _authenticated_bits_from_chain(chain, entries)
    if auth_bits:
        bits |= auth_bits
    for entry in entries:
        if entry.grantee_type == GRANTEE_AUTHENTICATED:
            continue
        if entry.grantee_type == GRANTEE_USER:
            if await user_grant_matches(db, entry.grantee_id, subject, payload):
                bits |= entry.permissions
            continue
        if _grant_matches(entry, subject, group_ids, subject_alias_set=alias_set):
            bits |= entry.permissions
    return bits


def _grant_matches(
    entry: ResourceAclEntry,
    subject: str,
    group_ids: set[str],
    *,
    subject_alias_set: set[str] | None = None,
) -> bool:
    if entry.grantee_type == GRANTEE_USER:
        if not entry.grantee_id:
            return False
        grantee = entry.grantee_id.strip()
        if grantee == subject:
            return True
        if subject_alias_set:
            if grantee in subject_alias_set:
                return True
            lower = grantee.lower()
            if lower in {a.lower() for a in subject_alias_set}:
                return True
        return False
    if entry.grantee_type == GRANTEE_GROUP:
        return entry.grantee_id in group_ids
    if entry.grantee_type == GRANTEE_AUTHENTICATED:
        return True
    return False


def _authenticated_bits_from_chain(
    chain: list[tuple[str, str]], entries: list[ResourceAclEntry]
) -> int | None:
    """Nearest explicit Others (authenticated) grant on chain; 0 means deny others here."""
    by_resource: dict[tuple[str, str], int] = {}
    for entry in entries:
        if entry.grantee_type == GRANTEE_AUTHENTICATED:
            by_resource[(entry.resource_type, entry.resource_id)] = entry.permissions
    for rt, rid in chain:
        if (rt, rid) in by_resource:
            return by_resource[(rt, rid)]
    return None


async def effective_permissions(
    db: AsyncSession,
    subject: str,
    resource_type: str,
    resource_id: str,
    payload: dict | None = None,
) -> int:
    group_ids = set(await user_group_ids(db, subject, payload))
    alias_set = subject_aliases(subject, payload)
    if settings.auth_mode == "local":
        from app.models.user import User

        user = await db.get(User, subject)
        if user:
            alias_set.add(str(user.id))
            alias_set.add(user.username)
            alias_set.add(user.username.lower())
    chain = await resource_context_chain(db, resource_type, resource_id)
    entries = await _acl_entries_for_resources(db, chain)
    bits = 0
    auth_bits = _authenticated_bits_from_chain(chain, entries)
    if auth_bits:
        bits |= auth_bits
    for entry in entries:
        if entry.grantee_type == GRANTEE_AUTHENTICATED:
            continue
        if entry.grantee_type == GRANTEE_USER:
            if await user_grant_matches(db, entry.grantee_id, subject, payload):
                bits |= entry.permissions
            continue
        if _grant_matches(entry, subject, group_ids, subject_alias_set=alias_set):
            bits |= entry.permissions
    return bits


async def check_resource_access(
    db: AsyncSession,
    payload: dict,
    subject: str,
    resource_type: str,
    resource_id: str,
    required: int,
) -> bool:
    # JWT admin may configure sharing (manage) but still needs ACL grants to read/write data.
    if jwt_is_admin(payload) and required == PERM_MANAGE:
        return True
    if not _acl_subject(payload, subject):
        return True
    if not await acl_check_required(db, resource_type, resource_id):
        return True
    bits = await effective_permissions(db, subject, resource_type, resource_id, payload)
    return perm_satisfies(bits, required)
