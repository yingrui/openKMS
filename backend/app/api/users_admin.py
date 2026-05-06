"""Console: Users & roles (local DB) or IdP notice (OIDC)."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import _hash_password, get_jwt_payload, require_permission
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.services.permission_catalog import PERM_CONSOLE_USERS
from app.services.user_roles_sync import sync_security_roles_for_user

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class LocalUserOut(BaseModel):
    id: str
    email: str
    username: str
    is_admin: bool
    created_at: datetime | None = None


class AdminUsersPageResponse(BaseModel):
    auth_mode: str
    """oidc | local"""
    managed_in_console: bool
    """True when users can be edited in this UI (local mode)."""
    idp_notice: str | None
    users: list[LocalUserOut]


class PatchLocalUserBody(BaseModel):
    is_admin: bool


class AdminCreateUserBody(BaseModel):
    email: EmailStr
    username: str = Field(min_length=2, max_length=128)
    password: str = Field(min_length=8, max_length=256)
    is_admin: bool = False


@router.get("", response_model=AdminUsersPageResponse)
async def admin_users_page(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_USERS)),
):
    if settings.auth_mode != "local":
        return AdminUsersPageResponse(
            auth_mode="oidc",
            managed_in_console=False,
            idp_notice=(
                "User accounts and roles (for example realm or application roles such as admin) are managed in your "
                "OpenID Connect identity provider. openKMS does not mirror the full user directory."
            ),
            users=[],
        )

    result = await db.execute(select(User).order_by(User.created_at))
    rows = list(result.scalars().all())
    users = [
        LocalUserOut(
            id=str(u.id),
            email=u.email,
            username=u.username,
            is_admin=u.is_admin,
            created_at=u.created_at,
        )
        for u in rows
    ]
    return AdminUsersPageResponse(
        auth_mode="local",
        managed_in_console=True,
        idp_notice=(
            "These accounts are stored in openKMS (local identity provider). "
            "Only the Admin role is managed here; use this page to grant or revoke console access."
        ),
        users=users,
    )


async def _admin_count(db: AsyncSession) -> int:
    n = await db.scalar(select(func.count()).select_from(User).where(User.is_admin == True))  # noqa: E712
    return int(n or 0)


@router.patch("/{user_id}", response_model=LocalUserOut)
async def patch_local_user(
    user_id: str,
    body: PatchLocalUserBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_USERS)),
):
    if settings.auth_mode != "local":
        raise HTTPException(status_code=403, detail="User management is only available in local auth mode")

    payload = await get_jwt_payload(request, db)
    current_sub = payload.get("sub")
    if not isinstance(current_sub, str):
        current_sub = None

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if user.is_admin and not body.is_admin:
        admins = await _admin_count(db)
        if admins <= 1:
            raise HTTPException(status_code=400, detail="Cannot remove the last admin")
        if current_sub and str(user.id) == current_sub:
            raise HTTPException(status_code=400, detail="Cannot remove admin role from yourself")

    user.is_admin = body.is_admin
    await sync_security_roles_for_user(db, user)
    await db.flush()
    await db.refresh(user)
    return LocalUserOut(
        id=str(user.id),
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )


@router.delete("/{user_id}", status_code=204)
async def delete_local_user(
    user_id: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_USERS)),
):
    if settings.auth_mode != "local":
        raise HTTPException(status_code=403, detail="User management is only available in local auth mode")

    payload = await get_jwt_payload(request, db)
    current_sub = payload.get("sub")
    if not isinstance(current_sub, str):
        current_sub = None

    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if current_sub and str(user.id) == current_sub:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")

    if user.is_admin:
        admins = await _admin_count(db)
        if admins <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")

    await db.execute(delete(User).where(User.id == user_id))


@router.post("", response_model=LocalUserOut, status_code=201)
async def create_local_user(
    body: AdminCreateUserBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_USERS)),
):
    if settings.auth_mode != "local":
        raise HTTPException(status_code=403, detail="User management is only available in local auth mode")

    username = body.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username is required")

    user = User(
        email=body.email.lower().strip(),
        username=username,
        password_hash=_hash_password(body.password),
        is_admin=body.is_admin,
    )
    db.add(user)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="Email or username already exists") from None

    await sync_security_roles_for_user(db, user)
    await db.flush()
    await db.refresh(user)
    return LocalUserOut(
        id=str(user.id),
        email=user.email,
        username=user.username,
        is_admin=user.is_admin,
        created_at=user.created_at,
    )
