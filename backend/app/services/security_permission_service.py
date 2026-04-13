"""DB-backed security permission catalog (keys + metadata)."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security_permission import SecurityPermission
from app.models.security_role import SecurityRolePermission


async def list_permissions_sorted(db: AsyncSession) -> list[SecurityPermission]:
    result = await db.execute(
        select(SecurityPermission).order_by(SecurityPermission.sort_order, SecurityPermission.key)
    )
    return list(result.scalars().all())


async def all_defined_permission_keys(db: AsyncSession) -> set[str]:
    result = await db.execute(select(SecurityPermission.key))
    return {row[0] for row in result.all() if row[0]}


async def sorted_permission_keys(db: AsyncSession) -> list[str]:
    rows = await list_permissions_sorted(db)
    return [r.key for r in rows]


async def get_permission_by_key(db: AsyncSession, key: str) -> SecurityPermission | None:
    result = await db.execute(select(SecurityPermission).where(SecurityPermission.key == key))
    return result.scalar_one_or_none()


async def permission_key_in_use(db: AsyncSession, key: str) -> bool:
    r = await db.execute(
        select(SecurityRolePermission.id).where(SecurityRolePermission.permission_key == key).limit(1)
    )
    return r.scalar_one_or_none() is not None


async def next_sort_order(db: AsyncSession) -> int:
    r = await db.execute(select(func.coalesce(func.max(SecurityPermission.sort_order), -1)))
    return int(r.scalar_one() or -1) + 1
