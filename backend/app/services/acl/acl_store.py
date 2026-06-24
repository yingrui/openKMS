"""ACL persistence: bootstrap owner grants and replace entry sets."""

from __future__ import annotations

from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.resource_acl import ResourceAclEntry
from app.services.acl.resource_acl_constants import (
    GRANTEE_USER,
    PERM_MANAGE,
    PERM_READ,
    PERM_WRITE,
    SECURABLE_RESOURCE_TYPES,
)

async def bootstrap_owner_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    owner_subject: str | None,
) -> None:
    """Grant owner rwm only. No Others row — non-owners are denied once any ACL exists.

    Pre-existing wiki spaces / knowledge bases (and channels) may have Others rwm from
    Alembic seed migrations; new creates rely on this owner-only bootstrap.
    """
    if not owner_subject or resource_type not in SECURABLE_RESOURCE_TYPES:
        return
    existing = await db.execute(
        select(ResourceAclEntry).where(
            ResourceAclEntry.resource_type == resource_type,
            ResourceAclEntry.resource_id == resource_id,
            ResourceAclEntry.grantee_type == GRANTEE_USER,
            ResourceAclEntry.grantee_id == owner_subject,
        )
    )
    if existing.scalar_one_or_none():
        return
    db.add(
        ResourceAclEntry(
            resource_type=resource_type,
            resource_id=resource_id,
            grantee_type=GRANTEE_USER,
            grantee_id=owner_subject,
            permissions=PERM_READ | PERM_WRITE | PERM_MANAGE,
        )
    )


async def list_acl_entries(
    db: AsyncSession, resource_type: str, resource_id: str
) -> list[ResourceAclEntry]:
    result = await db.execute(
        select(ResourceAclEntry)
        .where(
            ResourceAclEntry.resource_type == resource_type,
            ResourceAclEntry.resource_id == resource_id,
        )
        .order_by(ResourceAclEntry.grantee_type, ResourceAclEntry.grantee_id)
    )
    return list(result.scalars().all())


async def replace_resource_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    grants: list[dict[str, Any]],
) -> list[ResourceAclEntry]:
    from sqlalchemy import delete

    await db.execute(
        delete(ResourceAclEntry).where(
            ResourceAclEntry.resource_type == resource_type,
            ResourceAclEntry.resource_id == resource_id,
        )
    )
    out: list[ResourceAclEntry] = []
    for g in grants:
        label = g.get("grantee_label")
        grantee_label = label.strip() if isinstance(label, str) and label.strip() else None
        entry = ResourceAclEntry(
            resource_type=resource_type,
            resource_id=resource_id,
            grantee_type=g["grantee_type"],
            grantee_id=g.get("grantee_id"),
            grantee_label=grantee_label,
            permissions=int(g["permissions"]),
        )
        db.add(entry)
        out.append(entry)
    await db.flush()
    return out
