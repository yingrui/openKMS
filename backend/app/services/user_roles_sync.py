"""Keep user_security_roles in sync with users.is_admin (local mode)."""

from __future__ import annotations

import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security_role import SecurityRole, SecurityRolePermission, UserSecurityRole
from app.models.user import User
from app.services.permission_catalog import ADMIN_ROLE_NAME, MEMBER_ROLE_NAME, PERM_ALL


async def _role_id_by_name(db: AsyncSession, name: str) -> str | None:
    rid = await db.scalar(select(SecurityRole.id).where(SecurityRole.name == name))
    return str(rid) if rid else None


async def _ensure_member_role(db: AsyncSession) -> str | None:
    """Create the default 'member' role with only 'all' if missing (not created at DB migration)."""
    existing = await _role_id_by_name(db, MEMBER_ROLE_NAME)
    if existing:
        return existing
    role = SecurityRole(
        id=str(uuid.uuid4()),
        name=MEMBER_ROLE_NAME,
        description="Default non-admin role (created on first use; starts with 'all')",
    )
    db.add(role)
    await db.flush()
    db.add(
        SecurityRolePermission(
            id=str(uuid.uuid4()),
            role_id=role.id,
            permission_key=PERM_ALL,
        )
    )
    await db.flush()
    return role.id


async def sync_security_roles_for_user(db: AsyncSession, user: User) -> None:
    """Replace role links for this user based on is_admin flag."""
    admin_rid = await _role_id_by_name(db, ADMIN_ROLE_NAME)
    if not admin_rid:
        return
    await db.execute(delete(UserSecurityRole).where(UserSecurityRole.user_id == user.id))
    if user.is_admin:
        db.add(UserSecurityRole(user_id=user.id, role_id=admin_rid))
        await db.flush()
        return
    member_rid = await _ensure_member_role(db)
    if not member_rid:
        return
    db.add(UserSecurityRole(user_id=user.id, role_id=member_rid))
    await db.flush()
