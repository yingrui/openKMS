"""Console: security roles and permission matrix (PostgreSQL)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.config import settings
from app.database import get_db
from app.models.security_role import SecurityRole, SecurityRolePermission
from app.services.permission_catalog import (
    ADMIN_ROLE_NAME,
    MEMBER_ROLE_NAME,
    PERM_ALL,
    PERM_CONSOLE_PERMISSIONS,
)
from app.services.security_permission_service import all_defined_permission_keys

router = APIRouter(prefix="/admin/security-roles", tags=["admin-security-roles"])


def _is_reserved_role_name(name: str) -> bool:
    """Names the app uses for admin / default member (cannot create duplicates)."""
    return name in (ADMIN_ROLE_NAME, MEMBER_ROLE_NAME)


def _role_cannot_delete(role: SecurityRole) -> bool:
    return role.name == ADMIN_ROLE_NAME


class SecurityRoleOut(BaseModel):
    id: str
    name: str
    description: str | None
    permission_keys: list[str]
    is_system_role: bool = False


class SecurityRolesPageResponse(BaseModel):
    auth_mode: str
    managed_in_console: bool
    idp_notice: str | None
    roles: list[SecurityRoleOut]


class PutRolePermissionsBody(BaseModel):
    permission_keys: list[str] = Field(default_factory=list)


async def _all_valid(db: AsyncSession, keys: list[str]) -> bool:
    allowed = await all_defined_permission_keys(db)
    return all(k in allowed for k in keys)


async def _security_role_to_out(db: AsyncSession, r: SecurityRole) -> SecurityRoleOut:
    pr = await db.execute(
        select(SecurityRolePermission.permission_key).where(SecurityRolePermission.role_id == r.id)
    )
    keys = sorted({row[0] for row in pr.all()})
    return SecurityRoleOut(
        id=r.id,
        name=r.name,
        description=r.description,
        permission_keys=keys,
        is_system_role=_role_cannot_delete(r),
    )


@router.get("", response_model=SecurityRolesPageResponse)
async def list_security_roles(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    result = await db.execute(select(SecurityRole).order_by(SecurityRole.name))
    roles = list(result.scalars().all())
    out = [await _security_role_to_out(db, r) for r in roles]
    return SecurityRolesPageResponse(
        auth_mode=settings.auth_mode,
        managed_in_console=True,
        idp_notice=None,
        roles=out,
    )


@router.put("/{role_id}/permissions", response_model=SecurityRoleOut)
async def put_role_permissions(
    role_id: str,
    body: PutRolePermissionsBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    if not await _all_valid(db, body.permission_keys):
        raise HTTPException(status_code=400, detail="Unknown permission key in list")

    role = await db.get(SecurityRole, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")

    pr_old = await db.execute(
        select(SecurityRolePermission.permission_key).where(SecurityRolePermission.role_id == role_id)
    )
    old_keys = {row[0] for row in pr_old.all() if row[0]}
    new_keys_set = set(body.permission_keys)
    if not new_keys_set:
        raise HTTPException(status_code=400, detail="A role must have at least one permission")
    if PERM_ALL in old_keys and PERM_ALL not in new_keys_set and old_keys == {PERM_ALL}:
        raise HTTPException(
            status_code=400,
            detail="Add at least one other permission while 'all' is still enabled, save, then remove 'all'.",
        )

    await db.execute(delete(SecurityRolePermission).where(SecurityRolePermission.role_id == role_id))
    for key in body.permission_keys:
        db.add(SecurityRolePermission(role_id=role_id, permission_key=key))
    await db.flush()
    return await _security_role_to_out(db, role)


class SecurityRoleCreateBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    description: str | None = Field(None, max_length=2000)


@router.post("", response_model=SecurityRoleOut, status_code=201)
async def create_security_role(
    body: SecurityRoleCreateBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required")
    if _is_reserved_role_name(name):
        raise HTTPException(status_code=400, detail="This role name is reserved")
    existing = await db.execute(select(SecurityRole).where(SecurityRole.name == name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A role with this name already exists")
    role = SecurityRole(id=str(uuid.uuid4()), name=name, description=(body.description or "").strip() or None)
    db.add(role)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="A role with this name already exists") from None
    return await _security_role_to_out(db, role)


@router.delete("/{role_id}", status_code=204)
async def delete_security_role(
    role_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    role = await db.get(SecurityRole, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if _role_cannot_delete(role):
        raise HTTPException(status_code=400, detail="The admin role cannot be deleted")
    await db.delete(role)
