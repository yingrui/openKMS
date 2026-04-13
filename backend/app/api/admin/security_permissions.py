"""CRUD for security_permissions (operation catalog rows)."""

from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import require_permission
from app.database import get_db
from app.models.security_permission import SecurityPermission
from app.services.permission_catalog import PERM_CONSOLE_PERMISSIONS, PERM_ALL
from app.services.permission_pattern_cache import invalidate_permission_pattern_cache
from app.services.security_permission_service import (
    get_permission_by_key,
    list_permissions_sorted,
    next_sort_order,
    permission_key_in_use,
)

router = APIRouter(prefix="/admin/security-permissions", tags=["admin-security-permissions"])

_KEY_RE = re.compile(r"^[a-zA-Z0-9:_-]{1,128}$")


class SecurityPermissionOut(BaseModel):
    id: str
    key: str
    label: str
    description: str | None
    frontend_route_patterns: list[str]
    backend_api_patterns: list[str]
    sort_order: int
    created_at: datetime | None


class SecurityPermissionCreateBody(BaseModel):
    key: str = Field(..., min_length=1, max_length=128)
    label: str = Field(..., min_length=1, max_length=512)
    description: str | None = Field(None, max_length=8000)
    frontend_route_patterns: list[str] = Field(default_factory=list)
    backend_api_patterns: list[str] = Field(default_factory=list)
    sort_order: int | None = None


class SecurityPermissionPatchBody(BaseModel):
    label: str | None = Field(None, min_length=1, max_length=512)
    description: str | None = Field(None, max_length=8000)
    frontend_route_patterns: list[str] | None = None
    backend_api_patterns: list[str] | None = None
    sort_order: int | None = None


def _to_out(p: SecurityPermission) -> SecurityPermissionOut:
    fe = p.frontend_route_patterns if isinstance(p.frontend_route_patterns, list) else []
    be = p.backend_api_patterns if isinstance(p.backend_api_patterns, list) else []
    return SecurityPermissionOut(
        id=p.id,
        key=p.key,
        label=p.label,
        description=p.description,
        frontend_route_patterns=[str(x) for x in fe],
        backend_api_patterns=[str(x) for x in be],
        sort_order=p.sort_order,
        created_at=p.created_at,
    )


def _normalize_key(raw: str) -> str:
    return raw.strip()


def _validate_key(key: str) -> None:
    if not _KEY_RE.match(key):
        raise HTTPException(
            status_code=400,
            detail="Invalid permission key: use 1–128 chars from letters, digits, colon, underscore, hyphen.",
        )


def _validate_pattern_list(name: str, items: list[str]) -> None:
    for s in items:
        if not isinstance(s, str) or len(s) > 512:
            raise HTTPException(status_code=400, detail=f"Invalid {name} entry")
        if len(s) != len(s.strip()):
            raise HTTPException(status_code=400, detail=f"Trim pattern strings in {name}")


@router.get("", response_model=list[SecurityPermissionOut])
async def list_security_permissions(
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    rows = await list_permissions_sorted(db)
    return [_to_out(p) for p in rows]


@router.post("", response_model=SecurityPermissionOut, status_code=201)
async def create_security_permission(
    body: SecurityPermissionCreateBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    key = _normalize_key(body.key)
    _validate_key(key)
    if await get_permission_by_key(db, key):
        raise HTTPException(status_code=409, detail="A permission with this key already exists")
    _validate_pattern_list("frontend_route_patterns", body.frontend_route_patterns)
    _validate_pattern_list("backend_api_patterns", body.backend_api_patterns)
    sort_order = body.sort_order
    if sort_order is None:
        sort_order = await next_sort_order(db)
    row = SecurityPermission(
        id=str(uuid.uuid4()),
        key=key,
        label=body.label.strip(),
        description=(body.description or "").strip() or None,
        frontend_route_patterns=list(body.frontend_route_patterns),
        backend_api_patterns=list(body.backend_api_patterns),
        sort_order=sort_order,
    )
    db.add(row)
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(status_code=409, detail="A permission with this key already exists") from None
    invalidate_permission_pattern_cache()
    return _to_out(row)


@router.patch("/{permission_id}", response_model=SecurityPermissionOut)
async def patch_security_permission(
    permission_id: str,
    body: SecurityPermissionPatchBody,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    row = await db.get(SecurityPermission, permission_id)
    if not row:
        raise HTTPException(status_code=404, detail="Permission not found")
    if row.key == PERM_ALL:
        raise HTTPException(
            status_code=400,
            detail="The built-in 'all' permission cannot be modified",
        )
    if body.label is not None:
        row.label = body.label.strip()
    if body.description is not None:
        row.description = body.description.strip() or None
    if body.frontend_route_patterns is not None:
        _validate_pattern_list("frontend_route_patterns", body.frontend_route_patterns)
        row.frontend_route_patterns = list(body.frontend_route_patterns)
    if body.backend_api_patterns is not None:
        _validate_pattern_list("backend_api_patterns", body.backend_api_patterns)
        row.backend_api_patterns = list(body.backend_api_patterns)
    if body.sort_order is not None:
        row.sort_order = body.sort_order
    await db.flush()
    invalidate_permission_pattern_cache()
    return _to_out(row)


@router.delete("/{permission_id}", status_code=204)
async def delete_security_permission(
    permission_id: str,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_permission(PERM_CONSOLE_PERMISSIONS)),
):
    row = await db.get(SecurityPermission, permission_id)
    if not row:
        raise HTTPException(status_code=404, detail="Permission not found")
    if row.key == PERM_ALL:
        raise HTTPException(status_code=400, detail="The built-in 'all' permission cannot be deleted")
    if await permission_key_in_use(db, row.key):
        raise HTTPException(
            status_code=400,
            detail="Cannot delete: this permission is still assigned to one or more roles",
        )
    await db.delete(row)
    invalidate_permission_pattern_cache()
