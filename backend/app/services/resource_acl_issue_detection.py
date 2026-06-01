"""Detect resource ACL misconfigurations for Console data-security issues."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.access_group import AccessGroup, AccessGroupMember
from app.models.resource_acl import ResourceAclEntry
from app.models.user import User
from app.services.resource_acl_constants import (
    GRANTEE_AUTHENTICATED,
    GRANTEE_GROUP,
    GRANTEE_USER,
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    perm_label,
)
from app.services.resource_acl_service import (
    _acl_entries_for_resources,
    _authenticated_bits_from_chain,
    resource_context_chain,
)

# Critical issues (misconfiguration / risk).
ISSUE_OTHERS_MANAGE = "others_manage"
ISSUE_OTHERS_WRITE = "others_write"
ISSUE_UNKNOWN_GROUP = "unknown_group"
ISSUE_EMPTY_GROUP = "empty_group"
ISSUE_UNKNOWN_OWNER = "unknown_owner"
ISSUE_MISSING_OWNER = "missing_owner"
ISSUE_OWNER_NO_PERMISSIONS = "owner_no_permissions"
ISSUE_OWNER_NO_MANAGE = "owner_no_manage"
ISSUE_IMPLICIT_OTHERS = "implicit_others"

# Review recommended (may be intentional).
ISSUE_OTHERS_READ = "others_read"

ISSUE_TYPES_ORDER: tuple[str, ...] = (
    ISSUE_OTHERS_MANAGE,
    ISSUE_OTHERS_WRITE,
    ISSUE_UNKNOWN_GROUP,
    ISSUE_EMPTY_GROUP,
    ISSUE_UNKNOWN_OWNER,
    ISSUE_MISSING_OWNER,
    ISSUE_OWNER_NO_PERMISSIONS,
    ISSUE_OWNER_NO_MANAGE,
    ISSUE_IMPLICIT_OTHERS,
    ISSUE_OTHERS_READ,
)

ISSUE_REVIEW_TYPES: frozenset[str] = frozenset({ISSUE_OTHERS_READ})


class ResourceAclIssueScan:
    """Result of scanning one resource's persisted ACL rows."""

    __slots__ = ("issues", "broken_group_ids", "empty_group_ids", "inherited_others_label")

    def __init__(
        self,
        issues: list[str],
        broken_group_ids: list[str],
        empty_group_ids: list[str],
        inherited_others_label: str | None,
    ) -> None:
        self.issues = issues
        self.broken_group_ids = broken_group_ids
        self.empty_group_ids = empty_group_ids
        self.inherited_others_label = inherited_others_label


async def detect_resource_acl_issues(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    entries: list[ResourceAclEntry],
) -> ResourceAclIssueScan:
    issues: list[str] = []
    broken_group_ids: list[str] = []
    empty_group_ids: list[str] = []

    owner_entry = next((e for e in entries if e.grantee_type == GRANTEE_USER), None)
    if not owner_entry:
        issues.append(ISSUE_MISSING_OWNER)
    elif owner_entry.permissions == 0:
        issues.append(ISSUE_OWNER_NO_PERMISSIONS)
    elif not (owner_entry.permissions & PERM_MANAGE):
        issues.append(ISSUE_OWNER_NO_MANAGE)

    if owner_entry and owner_entry.grantee_id and settings.auth_mode == "local":
        if not await db.get(User, owner_entry.grantee_id):
            issues.append(ISSUE_UNKNOWN_OWNER)

    group_ids = [e.grantee_id for e in entries if e.grantee_type == GRANTEE_GROUP and e.grantee_id]
    if group_ids:
        result = await db.execute(select(AccessGroup.id).where(AccessGroup.id.in_(group_ids)))
        found = set(result.scalars().all())
        broken_group_ids = [gid for gid in group_ids if gid not in found]
        if broken_group_ids:
            issues.append(ISSUE_UNKNOWN_GROUP)

        valid_ids = [gid for gid in group_ids if gid in found]
        if valid_ids:
            counts_result = await db.execute(
                select(AccessGroupMember.group_id, func.count())
                .where(AccessGroupMember.group_id.in_(valid_ids))
                .group_by(AccessGroupMember.group_id)
            )
            member_counts = dict(counts_result.all())
            empty_group_ids = [gid for gid in valid_ids if member_counts.get(gid, 0) == 0]
            if empty_group_ids:
                issues.append(ISSUE_EMPTY_GROUP)

    auth = next((e for e in entries if e.grantee_type == GRANTEE_AUTHENTICATED), None)
    inherited_label: str | None = None
    has_group_grants = any(e.grantee_type == GRANTEE_GROUP for e in entries)

    if auth and auth.permissions > 0:
        if auth.permissions & PERM_MANAGE:
            issues.append(ISSUE_OTHERS_MANAGE)
        elif auth.permissions & PERM_WRITE:
            issues.append(ISSUE_OTHERS_WRITE)
        elif (auth.permissions & PERM_READ) and has_group_grants:
            issues.append(ISSUE_OTHERS_READ)
    elif entries:
        chain = await resource_context_chain(db, resource_type, resource_id)
        chain_entries = await _acl_entries_for_resources(db, chain)
        auth_bits = _authenticated_bits_from_chain(chain, chain_entries)
        has_local_others = any(e.grantee_type == GRANTEE_AUTHENTICATED for e in entries)
        if not has_local_others and auth_bits and auth_bits > 0:
            issues.append(ISSUE_IMPLICIT_OTHERS)
            inherited_label = perm_label(auth_bits)

    return ResourceAclIssueScan(
        issues=issues,
        broken_group_ids=broken_group_ids,
        empty_group_ids=empty_group_ids,
        inherited_others_label=inherited_label,
    )
