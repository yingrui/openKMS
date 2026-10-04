"""Resource sharing (ACL) API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.auth import get_jwt_payload, require_auth
from app.database import get_db
from app.models.access_group import AccessGroup
from app.schemas.resource_acl import OwnerCandidateOut, ResourceAclOut, ResourceAclPut
from app.services.acl.resource_acl_constants import (
    GRANTEE_AUTHENTICATED,
    GRANTEE_GROUP,
    GRANTEE_USER,
    GRANTEE_TYPES,
    PERM_ALL_DATA,
    PERM_MANAGE,
    PERM_READ,
    SECURABLE_RESOURCE_TYPES,
    parse_perm_string,
)
from app.services.acl.resource_acl_presentation import (
    list_local_owner_candidates,
    resource_creator_identity,
    serialize_resource_acl,
)
from app.services.acl.resource_acl_service import (
    check_resource_access,
    list_acl_entries,
    normalize_owner_grantee_id,
    replace_resource_acl,
    resource_has_acl_restrictions,
)

router = APIRouter(prefix="/resource-acl", tags=["resource-acl"], dependencies=[Depends(require_auth)])


def _parse_grants(body: ResourceAclPut) -> list[dict]:
    out: list[dict] = []
    for g in body.grants:
        if g.grantee_type not in GRANTEE_TYPES:
            raise HTTPException(status_code=400, detail=f"Invalid grantee_type: {g.grantee_type}")
        if g.grantee_type in (GRANTEE_USER, GRANTEE_GROUP) and not g.grantee_id:
            raise HTTPException(status_code=400, detail="grantee_id required for user/group grants")
        if g.grantee_type == GRANTEE_AUTHENTICATED:
            gid = None
        else:
            gid = g.grantee_id
        bits = parse_perm_string(g.permissions)
        if bits == 0 and g.grantee_type != GRANTEE_AUTHENTICATED:
            raise HTTPException(status_code=400, detail="At least one permission (r/w/m) required")
        label = g.grantee_label.strip() if g.grantee_label and g.grantee_label.strip() else None
        out.append(
            {
                "grantee_type": g.grantee_type,
                "grantee_id": gid,
                "permissions": bits,
                "grantee_label": label,
            }
        )
    return out


async def _ensure_owner_in_parsed(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    parsed: list[dict],
) -> None:
    if any(g["grantee_type"] == GRANTEE_USER for g in parsed):
        return
    existing_entries = await list_acl_entries(db, resource_type, resource_id)
    existing_owner = next((e for e in existing_entries if e.grantee_type == GRANTEE_USER), None)
    if existing_owner and existing_owner.grantee_id:
        parsed.append(
            {
                "grantee_type": GRANTEE_USER,
                "grantee_id": existing_owner.grantee_id,
                "permissions": existing_owner.permissions,
                "grantee_label": existing_owner.grantee_label,
            }
        )
        return
    creator_subject, creator_name = await resource_creator_identity(db, resource_type, resource_id)
    if creator_subject:
        parsed.append(
            {
                "grantee_type": GRANTEE_USER,
                "grantee_id": creator_subject,
                "permissions": PERM_ALL_DATA,
                "grantee_label": creator_name,
            }
        )


async def persist_resource_acl(
    db: AsyncSession,
    resource_type: str,
    resource_id: str,
    body: ResourceAclPut,
    viewer_sub: str,
    payload: dict,
    *,
    skip_manage_check: bool = False,
) -> ResourceAclOut:
    if not skip_manage_check:
        can_manage = await check_resource_access(db, payload, viewer_sub, resource_type, resource_id, PERM_MANAGE)
        if not can_manage:
            has_any = await resource_has_acl_restrictions(db, resource_type, resource_id)
            if has_any:
                raise HTTPException(status_code=403, detail="Manage permission required to change sharing")

    parsed = _parse_grants(body)
    for g in parsed:
        if g["grantee_type"] == GRANTEE_GROUP and g["grantee_id"]:
            if not await db.get(AccessGroup, g["grantee_id"]):
                raise HTTPException(status_code=400, detail=f"Group not found: {g['grantee_id']}")
        if g["grantee_type"] == GRANTEE_USER and g["grantee_id"]:
            g["grantee_id"] = await normalize_owner_grantee_id(db, g["grantee_id"], payload)

    await _ensure_owner_in_parsed(db, resource_type, resource_id, parsed)
    entries = await replace_resource_acl(db, resource_type, resource_id, parsed)
    await db.commit()
    return await serialize_resource_acl(
        db, resource_type, resource_id, viewer_sub, payload, entries=entries
    )


@router.get("/{resource_type}/{resource_id}/owner-candidates", response_model=list[OwnerCandidateOut])
async def get_owner_candidates(
    resource_type: str,
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not await check_resource_access(db, payload, sub, resource_type, resource_id, PERM_MANAGE):
        raise HTTPException(status_code=403, detail="Manage permission required")

    return await list_local_owner_candidates(db)


@router.get("/{resource_type}/{resource_id}", response_model=ResourceAclOut)
async def get_resource_acl(
    resource_type: str,
    resource_id: str,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not await check_resource_access(db, payload, sub, resource_type, resource_id, PERM_READ):
        raise HTTPException(status_code=404, detail="Resource not found")

    return await serialize_resource_acl(db, resource_type, resource_id, sub, payload)


@router.put("/{resource_type}/{resource_id}", response_model=ResourceAclOut)
async def put_resource_acl(
    resource_type: str,
    resource_id: str,
    body: ResourceAclPut,
    db: AsyncSession = Depends(get_db),
    payload: dict = Depends(get_jwt_payload),
):
    if resource_type not in SECURABLE_RESOURCE_TYPES:
        raise HTTPException(status_code=400, detail="Unknown resource type")
    sub = payload.get("sub")
    if not isinstance(sub, str):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return await persist_resource_acl(db, resource_type, resource_id, body, sub, payload)
